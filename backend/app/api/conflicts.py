"""Conflicts API router."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.domain.conflict_rules import detect_all
from app.models.conflicts import ConflictRecord
from app.models.events import SystemEvent
from app.models.infrastructure import Block, Station, TrackSection
from app.models.trains import StopTime, Train

router = APIRouter(prefix="/api", tags=["conflicts"])


def _load_network_data(db: Session) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Load trains, stop_times, sections, blocks from DB as plain dicts."""
    station_map = {s.id: s.code for s in db.query(Station).all()}
    sections_raw = db.query(TrackSection).all()

    trains = [
        {"train_number": t.train_number, "direction": t.direction, "priority": t.priority}
        for t in db.query(Train).filter(Train.is_active == True).all()  # noqa: E712
    ]
    train_map = {t.id: t.train_number for t in db.query(Train).all()}
    stop_times = [
        {
            "train_number": train_map.get(s.train_id, ""),
            "station_code": station_map.get(s.station_id, ""),
            "stop_sequence": s.stop_sequence,
            "planned_arrival_min": s.planned_arrival_min,
            "planned_departure_min": s.planned_departure_min,
            "revised_arrival_min": s.revised_arrival_min,
            "revised_departure_min": s.revised_departure_min,
            "dwell_min": s.dwell_min,
        }
        for s in db.query(StopTime).all()
    ]
    sections = [
        {
            "from_station_code": station_map.get(s.from_station_id, ""),
            "to_station_code": station_map.get(s.to_station_id, ""),
            "running_time_min": s.running_time_min,
            "headway_min": s.headway_min,
            "is_double_track": s.is_double_track,
        }
        for s in sections_raw
    ]
    sec_map = {s.id: s for s in sections_raw}
    blocks_raw = db.query(Block).all()
    blocks = [
        {
            "code": b.code,
            "section_from": station_map.get(sec_map[b.section_id].from_station_id, "") if b.section_id in sec_map else "",
            "section_to": station_map.get(sec_map[b.section_id].to_station_id, "") if b.section_id in sec_map else "",
            "block_index": b.block_index,
            "time_fraction": b.time_fraction,
        }
        for b in blocks_raw
    ]
    return trains, stop_times, sections, blocks


def _format_conflict_record(
    conflict_uid: str,
    conflict_type: str,
    severity: str,
    trains: list[str],
    resource_code: str,
    interval_start_min: int,
    interval_end_min: int,
    explanation: str,
    rule_source: str,
    suggested_actions: list[str],
    context: str = "baseline",
    record_id: int | None = None,
    detected_at: str | None = None,
) -> dict:
    t1 = trains[0] if trains else ""
    t2 = trains[1] if len(trains) > 1 else ""
    is_block = (
        resource_code.startswith("BLK_")
        or resource_code.startswith("BLK-")
        or resource_code.startswith("SEC_")
        or resource_code.startswith("SEC-")
    )
    return {
        "id": record_id,
        "conflict_uid": conflict_uid,
        "conflict_type": conflict_type,
        "severity": severity,
        "trains": trains,
        "train_1_number": t1,
        "train_2_number": t2,
        "resource_code": resource_code,
        "block_code": resource_code if is_block else None,
        "station_code": resource_code if not is_block else None,
        "interval_start_min": interval_start_min,
        "interval_end_min": interval_end_min,
        "start_time_min": interval_start_min,
        "end_time_min": interval_end_min,
        "explanation": explanation,
        "rule_source": rule_source,
        "suggested_actions": suggested_actions,
        "suggested_action": suggested_actions[0] if suggested_actions else "",
        "provenance": "algorithm_detected",
        "context": context,
        "detected_at": detected_at,
    }


@router.get("/conflicts")
def list_conflicts(
    context: str = Query("baseline"),
    severity: str = Query(""),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return persisted conflict records."""
    q = db.query(ConflictRecord).filter(ConflictRecord.context == context)
    if severity:
        q = q.filter(ConflictRecord.severity == severity)
    records = q.order_by(ConflictRecord.detected_at.desc()).all()

    # If no records exist in baseline and no revised schedule is active, auto-initialize live detection
    if not records and context == "baseline" and not severity:
        has_revised = db.query(StopTime).filter(StopTime.revised_departure_min.isnot(None)).first() is not None
        if not has_revised:
            detect_conflicts(use_revised=False, context="baseline", db=db)
            records = db.query(ConflictRecord).filter(ConflictRecord.context == context).order_by(ConflictRecord.detected_at.desc()).all()
    return [
        _format_conflict_record(
            conflict_uid=r.conflict_uid,
            conflict_type=r.conflict_type,
            severity=r.severity,
            trains=json.loads(r.trains_json),
            resource_code=r.resource_code,
            interval_start_min=r.interval_start_min,
            interval_end_min=r.interval_end_min,
            explanation=r.explanation,
            rule_source=r.rule_source,
            suggested_actions=json.loads(r.suggested_actions_json),
            context=r.context,
            record_id=r.id,
            detected_at=r.detected_at.isoformat() if r.detected_at else None,
        )
        for r in records
    ]


@router.get("/conflicts/list")
def list_conflicts_envelope(
    context: str = Query("baseline"),
    severity: str = Query(""),
    db: Session = Depends(get_db),
) -> dict:
    """Return persisted conflict records wrapped in an object with count."""
    items = list_conflicts(context=context, severity=severity, db=db)
    return {"conflicts": items, "count": len(items)}


@router.post("/conflicts/detect")
def detect_conflicts(
    use_revised: bool = False,
    context: str = "baseline",
    db: Session = Depends(get_db),
) -> dict:
    """Run conflict detection and persist results."""
    trains, stop_times, sections, blocks = _load_network_data(db)

    # Get closed blocks
    closed_blocks = {b.code for b in db.query(Block).filter(Block.state == "closed").all()}

    results = detect_all(
        trains, stop_times, sections, blocks,
        closed_blocks=closed_blocks,
        use_revised=use_revised,
        context=context,
    )

    # Clear old conflicts for this context
    db.query(ConflictRecord).filter(ConflictRecord.context == context).delete()

    persisted = []
    for r in results:
        rec = ConflictRecord(
            conflict_uid=r.conflict_uid,
            conflict_type=r.conflict_type.value,
            severity=r.severity.value,
            trains_json=json.dumps(r.trains),
            resource_code=r.resource_code,
            interval_start_min=r.interval_start_min,
            interval_end_min=r.interval_end_min,
            explanation=r.explanation,
            rule_source=r.rule_source,
            suggested_actions_json=json.dumps(r.suggested_actions),
            context=context,
        )
        db.add(rec)
        persisted.append(r)

    ev = SystemEvent(
        category="conflict",
        level="warning" if results else "info",
        message=f"Conflict detection run: {len(results)} conflicts found in context '{context}'.",
    )
    db.add(ev)
    db.commit()

    return {
        "count": len(results),
        "context": context,
        "conflicts": [
            _format_conflict_record(
                conflict_uid=r.conflict_uid,
                conflict_type=r.conflict_type.value,
                severity=r.severity.value,
                trains=r.trains,
                resource_code=r.resource_code,
                interval_start_min=r.interval_start_min,
                interval_end_min=r.interval_end_min,
                explanation=r.explanation,
                rule_source=r.rule_source,
                suggested_actions=r.suggested_actions,
                context=context,
            )
            for r in results
        ],
    }
