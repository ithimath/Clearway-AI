"""ORM models for maintenance jobs and plans."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class MaintenanceJob(Base):
    """A user-defined maintenance work order."""

    __tablename__ = "maintenance_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    # JSON list of block codes to close
    block_codes_json: Mapped[str] = mapped_column(Text, default="[]")
    # Duration in minutes
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    # Earliest start in minutes from midnight
    earliest_start_min: Mapped[int] = mapped_column(Integer, default=0)
    # Latest end in minutes from midnight
    latest_end_min: Mapped[int] = mapped_column(Integer, default=1440)
    priority: Mapped[int] = mapped_column(Integer, default=5)
    """Priority 1 (urgent) – 10 (routine)."""
    # JSON list of job IDs that must not overlap with this one
    no_overlap_job_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    # Status: pending | planned | active | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    plans: Mapped[list["MaintenancePlan"]] = relationship("MaintenancePlan", back_populates="job")


class MaintenancePlan(Base):
    """A solver-generated maintenance window assignment for a job."""

    __tablename__ = "maintenance_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("maintenance_jobs.id"), nullable=False)
    # Assigned start in minutes from midnight
    assigned_start_min: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_end_min: Mapped[int] = mapped_column(Integer, nullable=False)
    # Trains affected (JSON list of train numbers)
    affected_trains_json: Mapped[str] = mapped_column(Text, default="[]")
    # Total added delay in minutes (DERIVED by solver)
    total_added_delay_min: Mapped[int] = mapped_column(Integer, default=0)
    # Candidate rank (1 = best)
    rank: Mapped[int] = mapped_column(Integer, default=1)
    # Plain-language explanation (DERIVED from solver output)
    explanation: Mapped[str] = mapped_column(Text, default="")
    # Solver status: optimal | feasible | infeasible | unknown
    solver_status: Mapped[str] = mapped_column(String(20), default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job: Mapped["MaintenanceJob"] = relationship("MaintenanceJob", back_populates="plans")
