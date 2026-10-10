"""Trains API router — list, detail, delay injection."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.trains import StopTime, Train
from app.models.infrastructure import Station

router = APIRouter(prefix="/api", tags=["trains"])


@router.get("/trains")
def list_trains(
    search: str = Query("", description="Search by train number or name"),
    direction: str = Query("", description="Filter: up | down | ''"),
    train_type: str = Query("", description="Filter: express | passenger | ''"),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return all trains with summary info."""
    q = db.query(Train)
    if search:
        q = q.filter(
            Train.train_number.ilike(f"%{search}%") | Train.name.ilike(f"%{search}%")
        )
    if direction:
        q = q.filter(Train.direction == direction)
    if train_type:
        q = q.filter(Train.train_type == train_type)
    trains = q.all()

    station_map = {s.id: s.code for s in db.query(Station).all()}

    result = []
    for t in trains:
        stops = sorted(t.stop_times, key=lambda s: s.stop_sequence)
        origin = station_map.get(stops[0].station_id, "") if stops else ""
        dest = station_map.get(stops[-1].station_id, "") if stops else ""
        dep = stops[0].planned_departure_min if stops else None
        arr = stops[-1].planned_arrival_min if stops else None
        result.append(
            {
                "id": t.id,
                "train_number": t.train_number,
                "name": t.name,
                "train_type": t.train_type,
                "direction": t.direction,
                "priority": t.priority,
                "is_active": t.is_active,
                "origin": origin,
                "destination": dest,
                "planned_departure_min": dep,
                "planned_arrival_min": arr,
                "stop_count": len(stops),
                "provenance": t.provenance,
            }
        )
    return result


@router.get("/trains/{train_id}")
def get_train_detail(train_id: int, db: Session = Depends(get_db)) -> dict:
    """Return full schedule detail for a single train."""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    station_map = {s.id: {"code": s.code, "name": s.name} for s in db.query(Station).all()}
    stops = sorted(train.stop_times, key=lambda s: s.stop_sequence)

    stop_list = [
        {
            "stop_sequence": s.stop_sequence,
            "station_code": station_map.get(s.station_id, {}).get("code", ""),
            "station_name": station_map.get(s.station_id, {}).get("name", ""),
            "planned_arrival_min": s.planned_arrival_min,
            "planned_departure_min": s.planned_departure_min,
            "revised_arrival_min": s.revised_arrival_min,
            "revised_departure_min": s.revised_departure_min,
            "dwell_min": s.dwell_min,
            "provenance": s.provenance,
        }
        for s in stops
    ]

    return {
        "id": train.id,
        "train_number": train.train_number,
        "name": train.name,
        "train_type": train.train_type,
        "direction": train.direction,
        "priority": train.priority,
        "is_active": train.is_active,
        "provenance": train.provenance,
        "stops": stop_list,
    }


@router.post("/trains/{train_id}/inject-delay")
def inject_delay(train_id: int, delay_min: int, db: Session = Depends(get_db)) -> dict:
    """Inject a delay (minutes) into a train's first departure and propagate through all stops."""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    stops = sorted(train.stop_times, key=lambda s: s.stop_sequence)
    for stop in stops:
        if stop.planned_arrival_min is not None:
            stop.revised_arrival_min = stop.planned_arrival_min + delay_min
        if stop.planned_departure_min is not None:
            stop.revised_departure_min = stop.planned_departure_min + delay_min

    db.commit()
    return {"status": "ok", "train_number": train.train_number, "delay_applied_min": delay_min}
