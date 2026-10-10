"""ORM model for what-if scenarios."""

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.db import Base


class Scenario(Base):
    """An isolated what-if scenario forked from the baseline."""

    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    # Type: delay | closure | extended_runtime | junction_unavailable | priority_change | loop_removed
    scenario_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # JSON blob of scenario parameters
    parameters_json: Mapped[str] = mapped_column(Text, default="{}")
    # Status: pending | running | completed | failed
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # JSON results after running
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    parent_scenario_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("scenarios.id"), nullable=True)
