"""ORM models for railway infrastructure: stations, sections, blocks, junctions, loops."""

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Station(Base):
    """A station (stop) on the network. Coordinates are SOURCE if from dataset, ASSUMED if synthetic."""

    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    # provenance: SOURCE | DERIVED | ASSUMED
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")
    is_junction: Mapped[bool] = mapped_column(Boolean, default=False)
    has_passing_loop: Mapped[bool] = mapped_column(Boolean, default=False)
    platform_count: Mapped[int] = mapped_column(Integer, default=1)

    stop_times: Mapped[list["StopTime"]] = relationship(  # type: ignore[name-defined]
        "StopTime", foreign_keys="StopTime.station_id", back_populates="station"
    )
    sections_from: Mapped[list["TrackSection"]] = relationship(  # type: ignore[name-defined]
        "TrackSection", foreign_keys="TrackSection.from_station_id", back_populates="from_station"
    )
    sections_to: Mapped[list["TrackSection"]] = relationship(  # type: ignore[name-defined]
        "TrackSection", foreign_keys="TrackSection.to_station_id", back_populates="to_station"
    )


class TrackSection(Base):
    """A section of track between two consecutive stations."""

    __tablename__ = "track_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    from_station_id: Mapped[int] = mapped_column(Integer, ForeignKey("stations.id"), nullable=False)
    to_station_id: Mapped[int] = mapped_column(Integer, ForeignKey("stations.id"), nullable=False)
    # Minutes of running time between stations (SOURCE/DERIVED)
    running_time_min: Mapped[int] = mapped_column(Integer, nullable=False)
    # Distance in km (ASSUMED if not in dataset)
    distance_km: Mapped[float] = mapped_column(Float, default=0.0)
    is_double_track: Mapped[bool] = mapped_column(Boolean, default=False)
    # Minimum headway in minutes (ASSUMED)
    headway_min: Mapped[int] = mapped_column(Integer, default=5)
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")

    from_station: Mapped["Station"] = relationship("Station", foreign_keys=[from_station_id], back_populates="sections_from")
    to_station: Mapped["Station"] = relationship("Station", foreign_keys=[to_station_id], back_populates="sections_to")
    blocks: Mapped[list["Block"]] = relationship("Block", back_populates="section")


class Block(Base):
    """A signalling block derived from splitting a TrackSection (ASSUMED)."""

    __tablename__ = "blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    section_id: Mapped[int] = mapped_column(Integer, ForeignKey("track_sections.id"), nullable=False)
    # Position of this block within the section (0-indexed)
    block_index: Mapped[int] = mapped_column(Integer, default=0)
    # Proportion of running time this block occupies (0-1); ASSUMED
    time_fraction: Mapped[float] = mapped_column(Float, default=0.5)
    # Block state: available | occupied | reserved | closed | conflicted
    state: Mapped[str] = mapped_column(String(20), default="available")
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")

    section: Mapped["TrackSection"] = relationship("TrackSection", back_populates="blocks")


class Junction(Base):
    """A junction point (ASSUMED topology)."""

    __tablename__ = "junctions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    station_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("stations.id"), nullable=True)
    # JSON list of section IDs that meet at this junction
    section_ids_json: Mapped[str] = mapped_column(String(500), default="[]")
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")


class PassingLoop(Base):
    """A passing loop / refuge siding (ASSUMED)."""

    __tablename__ = "passing_loops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    station_id: Mapped[int] = mapped_column(Integer, ForeignKey("stations.id"), nullable=False)
    # Which sections this loop connects (JSON list of section IDs)
    section_ids_json: Mapped[str] = mapped_column(String(200), default="[]")
    capacity_trains: Mapped[int] = mapped_column(Integer, default=1)
    provenance: Mapped[str] = mapped_column(String(10), default="ASSUMED")
