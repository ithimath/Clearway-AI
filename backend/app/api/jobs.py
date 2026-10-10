"""Background jobs status API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.jobs import BackgroundJob

from app.models.opt_results import OptResult
import json

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job_status(job_id: str, db: Session = Depends(get_db)) -> dict:
    """Poll status of a background job."""
    job = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    result_data = None
    if job.result_id:
        opt = db.query(OptResult).filter(OptResult.id == job.result_id).first()
        if opt:
            try:
                revised = json.loads(opt.revised_schedule_json)
            except Exception:
                revised = []
            result_data = {
                "solver_status": opt.solver_status,
                "solve_time_s": opt.solve_time_s,
                "objective_value": opt.objective_value,
                "delay_before_min": opt.delay_before_min,
                "delay_after_min": opt.delay_after_min,
                "conflicts_before": opt.conflicts_before,
                "conflicts_after": opt.conflicts_after,
                "explanation": opt.explanation,
                "revised_schedule": revised,
            }

    return {
        "id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "progress": job.progress,
        "result_id": job.result_id,
        "result": result_data,
        "error_message": job.error,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


@router.get("")
def list_jobs(db: Session = Depends(get_db)) -> list[dict]:
    """Return all background jobs, newest first."""
    jobs = db.query(BackgroundJob).order_by(BackgroundJob.created_at.desc()).limit(50).all()
    return [
        {
            "id": j.id,
            "job_type": j.job_type,
            "status": j.status,
            "progress": j.progress,
            "result_id": j.result_id,
            "error": j.error,
            "created_at": j.created_at.isoformat(),
        }
        for j in jobs
    ]
