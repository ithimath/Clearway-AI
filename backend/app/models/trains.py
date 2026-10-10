"""ORM models for trains and their scheduled stop times."""

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Train(Base):
    """A train service running over the corridor."""

    __tablename__ = "trains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    train_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Type: express | passenger | freight | local
    train_type: Mapped[str] = mapped_column(String(20), default="passenger")
    priority: Mapped[int] = mapped_column(Integer, default=5)
    """Scheduling priority 1 (highest) – 10 (lowest)."""
    # Direction: up | down
    direction: Mapped[str] = mapped_column(String(10), default="up")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # provenance: SOURCE | ASSUMED
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")

    stop_times: Mapped[list["StopTime"]] = relationship(
        "StopTime", back_populates="train", order_by="StopTime.stop_sequence"
    )


class StopTime(Base):
    """A single stop in a train's schedule (planned time = minutes from midnight)."""

    __tablename__ = "stop_times"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    train_id: Mapped[int] = mapped_column(Integer, ForeignKey("trains.id"), nullable=False)
    station_id: Mapped[int] = mapped_column(Integer, ForeignKey("stations.id"), nullable=False)
    stop_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    # Planned times in minutes from midnight (can exceed 1440 for overnight)
    planned_arrival_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    planned_departure_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Revised times set by optimizer or scenario injection
    revised_arrival_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revised_departure_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Dwell time in minutes (DERIVED from dataset or ASSUMED)
    dwell_min: Mapped[int] = mapped_column(Integer, default=2)
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")

    train: Mapped["Train"] = relationship("Train", back_populates="stop_times")
    station: Mapped["Station"] = relationship(  # type: ignore[name-defined]
        "Station", foreign_keys=[station_id], back_populates="stop_times"
    )
