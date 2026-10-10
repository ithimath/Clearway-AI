"""ORM model for system events (audit log)."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SystemEvent(Base):
    """A real system event recorded during simulation, conflict detection, or optimization."""

    __tablename__ = "system_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Category: simulation | conflict | optimization | maintenance | data | scenario | rl
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    # Level: info | warning | error
    level: Mapped[str] = mapped_column(String(10), default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # Context reference (e.g. job ID, conflict ID, scenario ID)
    reference_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
