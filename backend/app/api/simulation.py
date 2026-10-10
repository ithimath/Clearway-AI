"""Simulation API router.

Controls: start, pause, resume, reset, step, speed.
State polling endpoint returns the full sim state for frontend rendering.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.infrastructure import Block, Station, TrackSection
from app.models.trains import StopTime, Train
from app.services.simulation import simulation_service

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SpeedRequest(BaseModel):
    factor: float


class StepRequest(BaseModel):
    steps: int = 1


def _ensure_initialized(db: Session) -> None:
    """Initialize the simulation service from DB if not already done."""
    if simulation_service.is_initialized():
        return

    stations = [
        {"code": s.code, "name": s.name, "lat": s.lat, "lon": s.lon}
        for s in db.query(Station).all()
    ]
    sections_raw = db.query(TrackSection).all()
    station_map = {s.id: s.code for s in db.query(Station).all()}
    sections = [
        {
            "from_station_code": station_map.get(s.from_station_id, ""),
            "to_station_code": station_map.get(s.to_station_id, ""),
            "running_time_min": s.running_time_min,
            "headway_min": s.headway_min,
            "is_double_track": s.is_double_track,
        }
        for s in sections_raw
    ]
    blocks_raw = db.query(Block).all()
    blocks = [
        {
            "code": b.code,
            "section_from": station_map.get(
                next((s.from_station_id for s in sections_raw if s.id == b.section_id), None), ""
            ),
            "section_to": station_map.get(
                next((s.to_station_id for s in sections_raw if s.id == b.section_id), None), ""
            ),
            "block_index": b.block_index,
            "time_fraction": b.time_fraction,
        }
        for b in blocks_raw
    ]
    trains_raw = db.query(Train).all()
    trains = [
        {
            "train_number": t.train_number,
            "name": t.name,
            "direction": t.direction,
            "priority": t.priority,
        }
        for t in trains_raw
    ]
    stop_times_raw = db.query(StopTime).all()
    stop_times = [
        {
            "train_number": next(
                (t.train_number for t in trains_raw if t.id == st.train_id), ""
            ),
            "station_code": station_map.get(st.station_id, ""),
            "stop_sequence": st.stop_sequence,
            "planned_arrival_min": st.planned_arrival_min,
            "planned_departure_min": st.planned_departure_min,
            "revised_arrival_min": st.revised_arrival_min,
            "revised_departure_min": st.revised_departure_min,
            "dwell_min": st.dwell_min,
        }
        for st in stop_times_raw
    ]

    simulation_service.initialize(stations, sections, blocks, trains, stop_times)


@router.get("/state")
def get_sim_state(db: Session = Depends(get_db)) -> dict:
    """Return current simulation state (poll this endpoint)."""
    _ensure_initialized(db)
    return simulation_service.get_state_dict()


@router.post("/start")
def start_sim(db: Session = Depends(get_db)) -> dict:
    _ensure_initialized(db)
    simulation_service.start()
    return {"status": "started"}


@router.post("/pause")
def pause_sim(db: Session = Depends(get_db)) -> dict:
    _ensure_initialized(db)
    simulation_service.pause()
    return {"status": "paused"}


@router.post("/resume")
def resume_sim(db: Session = Depends(get_db)) -> dict:
    _ensure_initialized(db)
    simulation_service.start()
    return {"status": "resumed"}


@router.post("/reset")
def reset_sim(start_time_min: int = 0, db: Session = Depends(get_db)) -> dict:
    _ensure_initialized(db)
    simulation_service.reset(start_time_min=start_time_min)
    return {"status": "reset", "start_time_min": start_time_min}


@router.post("/step")
def step_sim(req: StepRequest = StepRequest(), db: Session = Depends(get_db)) -> dict:
    _ensure_initialized(db)
    steps = max(1, min(req.steps, 60))
    simulation_service.step(steps)
    return {"status": "stepped", "steps": steps, **simulation_service.get_state_dict()}


@router.post("/speed")
def set_speed(req: SpeedRequest, db: Session = Depends(get_db)) -> dict:
    _ensure_initialized(db)
    simulation_service.set_speed(req.factor)
    return {"status": "ok", "speed_factor": req.factor}
