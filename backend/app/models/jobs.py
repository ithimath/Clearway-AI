"""ORM model for background jobs (optimize, maintenance plan, RL train)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BackgroundJob(Base):
    """Tracks long-running background jobs polled by the frontend."""

    __tablename__ = "background_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    """UUID string."""
    # Type: optimize | maintenance_plan | rl_train | sim_run
    job_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # Status: queued | running | completed | failed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="queued")
    # Progress 0.0 – 1.0
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    # ID of the result record (e.g. OptResult.id) once complete
    result_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
