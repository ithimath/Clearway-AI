"""Schedule optimization API router — triggers CP-SAT as a background job."""

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
from app.models.opt_results import OptResult

router = APIRouter(prefix="/api", tags=["optimize"])


class OptimizeRequest(BaseModel):
    delay_weight: float = 1.0
    timetable_change_penalty: float = 0.5
    waiting_penalty: float = 0.3
    time_limit_s: float = 30.0


@router.post("/optimize/schedule")
@router.post("/schedule/optimize")
def run_optimize(req: OptimizeRequest = OptimizeRequest(), db: Session = Depends(get_db)) -> dict:
    """Start an async CP-SAT schedule optimization job."""
    job_id = str(uuid.uuid4())
    job = BackgroundJob(
        id=job_id,
        job_type="optimize",
        status="queued",
        progress=0.0,
    )
    db.add(job)
    ev = SystemEvent(
        category="optimization",
        level="info",
        message=f"Schedule optimization job {job_id} queued.",
        reference_id=job_id,
    )
    db.add(ev)
    db.commit()

    weights = req.model_dump()
    thread = threading.Thread(
        target=_run_optimization_job,
        args=(job_id, weights),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id, "status": "queued"}


def _run_optimization_job(job_id: str, weights: dict) -> None:
    """Background thread: run CP-SAT optimizer and persist result."""
    from app.optimization.cpsat_schedule import optimize_schedule

    db = SessionLocal()
    try:
        _update_job(db, job_id, "running", 0.1)
        result = optimize_schedule(db, weights)
        opt = OptResult(
            job_id=job_id,
            opt_type="optimize",
            solver_status=result["solver_status"],
            solve_time_s=result["solve_time_s"],
            objective_value=result.get("objective_value"),
            delay_before_min=result["delay_before_min"],
            delay_after_min=result["delay_after_min"],
            conflicts_before=result["conflicts_before"],
            conflicts_after=result["conflicts_after"],
            revised_schedule_json=json.dumps(result["revised_schedule"]),
            explanation=result["explanation"],
            weights_json=json.dumps(weights),
        )
        db.add(opt)
        db.flush()
        _update_job(db, job_id, "completed", 1.0, result_id=opt.id)
        ev = SystemEvent(
            category="optimization",
            level="info",
            message=f"Optimization {job_id} completed: {result['solver_status']}. "
                    f"Delay {result['delay_before_min']}→{result['delay_after_min']} min.",
            reference_id=job_id,
        )
        db.add(ev)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        _update_job(db, job_id, "failed", error=str(exc))
        db.commit()
    finally:
        db.close()


def _update_job(
    db: Session,
    job_id: str,
    status: str,
    progress: float = 0.0,
    result_id: int | None = None,
    error: str | None = None,
) -> None:
    job = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
    if job:
        job.status = status
        job.progress = progress
        job.updated_at = datetime.utcnow()
        if result_id is not None:
            job.result_id = result_id
        if error is not None:
            job.error = error
        db.commit()
