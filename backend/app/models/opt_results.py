"""ORM model for CP-SAT optimization results."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OptResult(Base):
    """Result of a CP-SAT schedule optimization run."""

    __tablename__ = "opt_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # optimize | maintenance
    opt_type: Mapped[str] = mapped_column(String(20), default="optimize")
    # Solver status: OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN | MODEL_INVALID
    solver_status: Mapped[str] = mapped_column(String(20), nullable=False)
    solve_time_s: Mapped[float] = mapped_column(Float, default=0.0)
    # Objective value
    objective_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Delay before/after optimization in total minutes (DERIVED)
    delay_before_min: Mapped[float] = mapped_column(Float, default=0.0)
    delay_after_min: Mapped[float] = mapped_column(Float, default=0.0)
    conflicts_before: Mapped[int] = mapped_column(Integer, default=0)
    conflicts_after: Mapped[int] = mapped_column(Integer, default=0)
    # JSON revised schedule (list of stop times with revised times)
    revised_schedule_json: Mapped[str] = mapped_column(Text, default="[]")
    # Plain-language explanation
    explanation: Mapped[str] = mapped_column(Text, default="")
    # JSON of solver weights used
    weights_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
