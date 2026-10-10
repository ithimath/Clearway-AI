"""Maintenance planner API router."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.models.jobs import BackgroundJob
from app.models.events import SystemEvent
from app.models.maintenance import MaintenanceJob, MaintenancePlan

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


class MaintenanceJobCreate(BaseModel):
    title: str = "Track Maintenance"
    job_name: str | None = None
    description: str = ""
    block_codes: list[str] = []
    block_code: str | None = None
    duration_min: int = 60
    earliest_start_min: int = 0
    latest_end_min: int = 1440
    priority: int = 5
    no_overlap_job_ids: list[int] = []


class MaintenancePlanRequest(BaseModel):
    job_ids: list[int] = []
    """If empty, plan all pending jobs jointly."""
    time_limit_s: float = 30.0


@router.get("/jobs")
def list_maintenance_jobs(db: Session = Depends(get_db)) -> list[dict]:
    jobs = db.query(MaintenanceJob).order_by(MaintenanceJob.created_at.desc()).all()
    # also include assigned plan times if available
    plans_by_job = {p.job_id: p for p in db.query(MaintenancePlan).all()}
    return [
        {
            "id": j.id,
            "job_name": j.title,
            "title": j.title,
            "description": j.description,
            "block_codes": json.loads(j.block_codes_json),
            "block_code": json.loads(j.block_codes_json)[0] if json.loads(j.block_codes_json) else "",
            "duration_min": j.duration_min,
            "earliest_start_min": j.earliest_start_min,
            "latest_end_min": j.latest_end_min,
            "priority": j.priority,
            "status": "scheduled" if j.id in plans_by_job else j.status,
            "assigned_start_min": plans_by_job[j.id].assigned_start_min if j.id in plans_by_job else None,
            "assigned_end_min": plans_by_job[j.id].assigned_end_min if j.id in plans_by_job else None,
            "created_at": j.created_at.isoformat(),
        }
        for j in jobs
    ]


@router.post("/jobs")
def create_maintenance_job(req: MaintenanceJobCreate, db: Session = Depends(get_db)) -> dict:
    title = req.job_name or req.title
    blks = req.block_codes
    if not blks and req.block_code:
        blks = [req.block_code]

    job = MaintenanceJob(
        title=title,
        description=req.description,
        block_codes_json=json.dumps(blks),
        duration_min=req.duration_min,
        earliest_start_min=req.earliest_start_min,
        latest_end_min=req.latest_end_min,
        priority=req.priority,
        no_overlap_job_ids_json=json.dumps(req.no_overlap_job_ids),
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return {
        "id": job.id,
        "job_name": job.title,
        "block_code": blks[0] if blks else "",
        "status": job.status,
        "duration_min": job.duration_min,
        "earliest_start_min": job.earliest_start_min,
        "latest_end_min": job.latest_end_min,
        "priority": job.priority,
    }


@router.post("/plan")
@router.post("/optimize")
def plan_maintenance(req: MaintenancePlanRequest = MaintenancePlanRequest(), db: Session = Depends(get_db)) -> dict:
    """Start async maintenance planning job."""
    job_id = str(uuid.uuid4())
    bg_job = BackgroundJob(id=job_id, job_type="maintenance_plan", status="queued", progress=0.0)
    db.add(bg_job)
    ev = SystemEvent(
        category="maintenance",
        level="info",
        message=f"Maintenance planning job {job_id} queued.",
        reference_id=job_id,
    )
    db.add(ev)
    db.commit()

    thread = threading.Thread(
        target=_run_maintenance_job,
        args=(job_id, req.job_ids, req.time_limit_s),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id, "status": "queued"}


def _run_maintenance_job(job_id: str, job_ids: list[int], time_limit_s: float) -> None:
    from app.optimization.maintenance_planner import plan_maintenance_windows

    db = SessionLocal()
    try:
        _update_job(db, job_id, "running", 0.1)
        result = plan_maintenance_windows(db, job_ids, time_limit_s)
        _update_job(db, job_id, "completed", 1.0)
        ev = SystemEvent(
            category="maintenance",
            level="info",
            message=f"Maintenance planning {job_id} completed: {result['solver_status']}. "
                    f"{len(result['plans'])} plan(s) created.",
            reference_id=job_id,
        )
        db.add(ev)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        _update_job(db, job_id, "failed", error=str(exc))
        db.commit()
    finally:
        db.close()


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)) -> list[dict]:
    plans = (
        db.query(MaintenancePlan)
        .order_by(MaintenancePlan.rank)
        .all()
    )
    return [
        {
            "id": p.id,
            "job_id": p.job_id,
            "assigned_start_min": p.assigned_start_min,
            "assigned_end_min": p.assigned_end_min,
            "affected_trains": json.loads(p.affected_trains_json),
            "total_added_delay_min": p.total_added_delay_min,
            "rank": p.rank,
            "explanation": p.explanation,
            "solver_status": p.solver_status,
        }
        for p in plans
    ]


def _update_job(
    db: Session,
    job_id: str,
    status: str,
    progress: float = 0.0,
    error: str | None = None,
) -> None:
    job = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
    if job:
        job.status = status
        job.progress = progress
        job.updated_at = datetime.utcnow()
        if error:
            job.error = error
        db.commit()
