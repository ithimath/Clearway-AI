"""Export API router — CSV, Markdown report."""

from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.conflicts import ConflictRecord
from app.models.infrastructure import Block, Station, TrackSection
from app.models.maintenance import MaintenancePlan
from app.models.trains import StopTime, Train

router = APIRouter(prefix="/api/export", tags=["export"])


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    if not rows:
        content = ""
    else:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        content = buf.getvalue()
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/timetable")
def export_timetable(db: Session = Depends(get_db)) -> StreamingResponse:
    """Export baseline timetable as CSV. Provenance: SOURCE/ASSUMED."""
    station_map = {s.id: s.code for s in db.query(Station).all()}
    train_map = {t.id: t.train_number for t in db.query(Train).all()}
    stops = db.query(StopTime).all()
    rows = [
        {
            "train_number": train_map.get(s.train_id, ""),
            "station_code": station_map.get(s.station_id, ""),
            "stop_sequence": s.stop_sequence,
            "planned_arrival_min": s.planned_arrival_min,
            "planned_departure_min": s.planned_departure_min,
            "revised_arrival_min": s.revised_arrival_min,
            "revised_departure_min": s.revised_departure_min,
            "dwell_min": s.dwell_min,
            "provenance": s.provenance,
        }
        for s in stops
    ]
    return _csv_response(rows, "timetable_export.csv")


@router.get("/conflicts")
def export_conflicts(db: Session = Depends(get_db)) -> StreamingResponse:
    """Export conflict report as CSV. Provenance: DERIVED."""
    records = db.query(ConflictRecord).all()
    rows = [
        {
            "conflict_uid": r.conflict_uid,
            "conflict_type": r.conflict_type,
            "severity": r.severity,
            "trains": r.trains_json,
            "resource_code": r.resource_code,
            "interval_start_min": r.interval_start_min,
            "interval_end_min": r.interval_end_min,
            "explanation": r.explanation,
            "rule_source": r.rule_source,
            "context": r.context,
            "detected_at": r.detected_at.isoformat(),
            "provenance": "DERIVED",
        }
        for r in records
    ]
    return _csv_response(rows, "conflict_report.csv")


@router.get("/maintenance-plan")
def export_maintenance_plan(db: Session = Depends(get_db)) -> StreamingResponse:
    """Export maintenance plan as CSV. Provenance: DERIVED."""
    plans = db.query(MaintenancePlan).all()
    job_map = {j.id: j.title for j in db.query(__import__("app.models.maintenance", fromlist=["MaintenanceJob"]).MaintenanceJob).all()}
    rows = [
        {
            "plan_id": p.id,
            "job_id": p.job_id,
            "job_title": job_map.get(p.job_id, ""),
            "assigned_start_min": p.assigned_start_min,
            "assigned_end_min": p.assigned_end_min,
            "affected_trains": p.affected_trains_json,
            "total_added_delay_min": p.total_added_delay_min,
            "rank": p.rank,
            "solver_status": p.solver_status,
            "explanation": p.explanation,
            "provenance": "DERIVED",
        }
        for p in plans
    ]
    return _csv_response(rows, "maintenance_plan.csv")
