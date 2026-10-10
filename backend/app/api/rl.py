"""RL Lab API router — train, status, evaluate."""

from __future__ import annotations

import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.models.jobs import BackgroundJob
from app.models.events import SystemEvent

router = APIRouter(prefix="/api/rl", tags=["rl"])


class RLTrainRequest(BaseModel):
    total_timesteps: int = 10000
    seed: int = 42


@router.get("/status")
def rl_status() -> dict:
    """Return RL module availability and model status."""
    try:
        import stable_baselines3  # noqa: F401
        rl_available = True
    except ImportError:
        rl_available = False

    model_exists = False
    import os
    model_path = "backend/rl_model.zip"
    if os.path.exists(model_path):
        model_exists = True

    return {
        "rl_available": rl_available,
        "model_trained": model_exists,
        "label": "Trained" if model_exists else "Untrained — train it to see results",
    }


@router.post("/train")
def train_rl(req: RLTrainRequest, db: Session = Depends(get_db)) -> dict:
    """Start RL training as a background job."""
    try:
        import stable_baselines3  # noqa: F401
    except ImportError:
        return {"error": "RL dependencies not installed. Run: pip install -r requirements-rl.txt"}

    job_id = str(uuid.uuid4())
    job = BackgroundJob(id=job_id, job_type="rl_train", status="queued", progress=0.0)
    db.add(job)
    ev = SystemEvent(
        category="rl",
        level="info",
        message=f"RL training job {job_id} queued ({req.total_timesteps} timesteps).",
        reference_id=job_id,
    )
    db.add(ev)
    db.commit()

    thread = threading.Thread(
        target=_run_rl_training,
        args=(job_id, req.total_timesteps, req.seed),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id, "status": "queued"}


def _run_rl_training(job_id: str, total_timesteps: int, seed: int) -> None:
    db = SessionLocal()
    try:
        _update_job(db, job_id, "running", 0.1)
        from app.rl.train import train_rl_agent
        train_rl_agent(total_timesteps=total_timesteps, seed=seed,
                       progress_cb=lambda p: _update_job(db, job_id, "running", p))
        _update_job(db, job_id, "completed", 1.0)
        ev = SystemEvent(
            category="rl", level="info",
            message=f"RL training job {job_id} completed.",
            reference_id=job_id,
        )
        db.add(ev)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        _update_job(db, job_id, "failed", error=str(exc))
        db.commit()
    finally:
        db.close()


@router.get("/evaluate")
def evaluate_rl(db: Session = Depends(get_db)) -> dict:
    """Evaluate trained RL vs baselines. Returns honest results or untrained label."""
    try:
        import stable_baselines3  # noqa: F401
    except ImportError:
        return {"error": "RL dependencies not installed."}

    import os
    if not os.path.exists("backend/rl_model.zip"):
        return {
            "rl_available": True,
            "model_trained": False,
            "message": "Untrained — train it to see results",
        }

    from app.rl.evaluate import evaluate_agents
    return evaluate_agents(db)


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
        db.flush()
        db.commit()
