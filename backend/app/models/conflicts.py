"""ORM model for detected conflicts."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConflictRecord(Base):
    """A detected conflict between trains or between a train and a maintenance closure."""

    __tablename__ = "conflict_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conflict_uid: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # Type: reservation_overlap | headway_violation | opposing_movement |
    #       junction_conflict | delay_conflict | closure_conflict | infeasible_sequence
    conflict_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # Severity: critical | high | medium | low
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    # JSON list of train numbers involved
    trains_json: Mapped[str] = mapped_column(Text, default="[]")
    # Block or section code where conflict occurs
    resource_code: Mapped[str] = mapped_column(String(30), nullable=False)
    # Interval in minutes from midnight: start and end
    interval_start_min: Mapped[int] = mapped_column(Integer, nullable=False)
    interval_end_min: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="")
    rule_source: Mapped[str] = mapped_column(String(20), default="ASSUMED")
    # JSON list of suggested action strings
    suggested_actions_json: Mapped[str] = mapped_column(Text, default="[]")
    # Context: baseline | scenario_{id} | optimized
    context: Mapped[str] = mapped_column(String(50), default="baseline")
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
