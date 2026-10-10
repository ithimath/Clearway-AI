"""Metrics and events API router — dashboard analytics."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.infrastructure import Block
from app.models.trains import Train, StopTime
from app.models.conflicts import ConflictRecord
from app.models.events import SystemEvent

router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics")
def get_metrics(db: Session = Depends(get_db)) -> dict:
    """Return dashboard KPI metrics computed from the database."""
    total_trains = db.query(Train).count()
    active_trains = db.query(Train).filter(Train.is_active == True).count()  # noqa: E712

    total_blocks = db.query(Block).count()
    occupied_blocks = db.query(Block).filter(Block.state == "occupied").count()
    available_blocks = db.query(Block).filter(Block.state == "available").count()
    closed_blocks = db.query(Block).filter(Block.state == "closed").count()
    conflicted_blocks = db.query(Block).filter(Block.state == "conflicted").count()

    # Delay stats from revised vs planned times (DERIVED)
    stops = db.query(StopTime).filter(StopTime.revised_arrival_min.isnot(None)).all()
    delays = []
    for s in stops:
        if s.planned_arrival_min is not None and s.revised_arrival_min is not None:
            delays.append(s.revised_arrival_min - s.planned_arrival_min)

    avg_delay = sum(delays) / len(delays) if delays else 0.0
    total_delay = sum(delays) if delays else 0.0
    on_time_pct = (sum(1 for d in delays if d <= 5) / len(delays) * 100) if delays else 100.0

    total_conflicts = db.query(ConflictRecord).count()
    critical_conflicts = (
        db.query(ConflictRecord).filter(ConflictRecord.severity == "critical").count()
    )

    return {
        "trains": {
            "total": total_trains,
            "active": active_trains,
            "provenance": "DERIVED",
        },
        "blocks": {
            "total": total_blocks,
            "occupied": occupied_blocks,
            "available": available_blocks,
            "closed": closed_blocks,
            "conflicted": conflicted_blocks,
            "provenance": "ASSUMED",
        },
        "delays": {
            "avg_min": round(avg_delay, 1),
            "total_min": round(total_delay, 1),
            "on_time_pct": round(on_time_pct, 1),
            "provenance": "DERIVED",
        },
        "conflicts": {
            "total": total_conflicts,
            "critical": critical_conflicts,
            "provenance": "DERIVED",
        },
    }


@router.get("/events")
def get_events(limit: int = 50, db: Session = Depends(get_db)) -> list[dict]:
    """Return recent system events ordered newest-first."""
    events = (
        db.query(SystemEvent)
        .order_by(SystemEvent.occurred_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "category": e.category,
            "level": e.level,
            "message": e.message,
            "reference_id": e.reference_id,
            "occurred_at": e.occurred_at.isoformat(),
        }
        for e in events
    ]
