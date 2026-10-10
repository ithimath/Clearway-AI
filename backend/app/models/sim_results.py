"""ORM model for simulation run results."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SimResult(Base):
    """Snapshot of a completed simulation run."""

    __tablename__ = "sim_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scenario_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Duration simulated in minutes
    duration_min: Mapped[int] = mapped_column(Integer, default=0)
    # Summary metrics
    total_delay_min: Mapped[float] = mapped_column(Float, default=0.0)
    avg_delay_min: Mapped[float] = mapped_column(Float, default=0.0)
    conflict_count: Mapped[int] = mapped_column(Integer, default=0)
    on_time_pct: Mapped[float] = mapped_column(Float, default=0.0)
    # JSON list of block state snapshots
    block_states_json: Mapped[str] = mapped_column(Text, default="[]")
    ran_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    seed: Mapped[int] = mapped_column(Integer, default=42)
