"""Scenario runner service — applies scenario parameters and detects conflicts."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.domain.conflict_rules import detect_all
from app.models.conflicts import ConflictRecord
from app.models.events import SystemEvent
from app.models.infrastructure import Block, Station, TrackSection
from app.models.scenarios import Scenario
from app.models.trains import StopTime, Train


def run_scenario_service(db: Session, scenario: Scenario) -> dict:
    """Apply scenario parameters, detect conflicts, persist result, return comparison."""
    params = json.loads(scenario.parameters_json)
    scenario_type = scenario.scenario_type
    context = f"scenario_{scenario.id}"

    station_map = {s.id: s.code for s in db.query(Station).all()}
    sections_raw = db.query(TrackSection).all()
    blocks_raw = db.query(Block).all()
    trains_raw = db.query(Train).all()
    stops_raw = db.query(StopTime).all()
    train_map = {t.id: t.train_number for t in trains_raw}

    trains_dicts = [{"train_number": t.train_number, "direction": t.direction, "priority": t.priority} for t in trains_raw]
    section_dicts = [
        {
            "from_station_code": station_map.get(s.from_station_id, ""),
            "to_station_code": station_map.get(s.to_station_id, ""),
            "running_time_min": s.running_time_min,
            "headway_min": s.headway_min,
            "is_double_track": s.is_double_track,
        }
        for s in sections_raw
    ]
    block_dicts = []
    for b in blocks_raw:
        sec = next((s for s in sections_raw if s.id == b.section_id), None)
        if sec:
            block_dicts.append({
                "code": b.code,
                "section_from": station_map.get(sec.from_station_id, ""),
                "section_to": station_map.get(sec.to_station_id, ""),
                "block_index": b.block_index,
                "time_fraction": b.time_fraction,
            })
    stop_dicts_base = [
        {
            "train_number": train_map.get(s.train_id, ""),
            "station_code": station_map.get(s.station_id, ""),
            "stop_sequence": s.stop_sequence,
            "planned_arrival_min": s.planned_arrival_min,
            "planned_departure_min": s.planned_departure_min,
            "revised_arrival_min": None,
            "revised_departure_min": None,
            "dwell_min": s.dwell_min,
        }
        for s in stops_raw
    ]

    # Apply scenario modifications (supports simultaneous train delay and block closure)
    closed_blocks: set[str] = set()
    scenario_stops = [dict(s) for s in stop_dicts_base]
    has_delay = False

    train_number = params.get("train_number", "")
    delay_min = params.get("delay_min", 0)
    if train_number and train_number != "none" and delay_min:
        delay_val = int(delay_min)
        has_delay = True
        for st in scenario_stops:
            if st["train_number"] == train_number:
                if st["planned_departure_min"] is not None:
                    st["revised_departure_min"] = st["planned_departure_min"] + delay_val
                if st["planned_arrival_min"] is not None:
                    st["revised_arrival_min"] = st["planned_arrival_min"] + delay_val

    block_code = params.get("block_code", "")
    if block_code and block_code != "none":
        closed_blocks.add(block_code)
        closed_blocks.add(f"{block_code}-REV")

    if scenario_type == "extended_runtime":
        from_st = params.get("from_station", "")
        to_st = params.get("to_station", "")
        extra_min = int(params.get("extra_min", 10))
        for sd in section_dicts:
            if sd["from_station_code"] == from_st and sd["to_station_code"] == to_st:
                sd["running_time_min"] += extra_min

    # Run baseline conflicts (no scenario)
    baseline_conflicts = detect_all(trains_dicts, stop_dicts_base, section_dicts, block_dicts, context="baseline")

    # Run scenario conflicts
    use_rev = has_delay or scenario_type == "delay"
    scenario_conflicts = detect_all(
        trains_dicts, scenario_stops, section_dicts, block_dicts,
        closed_blocks=closed_blocks, use_revised=use_rev, context=context,
    )

    # Persist scenario conflicts
    db.query(ConflictRecord).filter(ConflictRecord.context == context).delete()
    for c in scenario_conflicts:
        db.add(ConflictRecord(
            conflict_uid=c.conflict_uid,
            conflict_type=c.conflict_type.value,
            severity=c.severity.value,
            trains_json=json.dumps(c.trains),
            resource_code=c.resource_code,
            interval_start_min=c.interval_start_min,
            interval_end_min=c.interval_end_min,
            explanation=c.explanation,
            rule_source=c.rule_source,
            suggested_actions_json=json.dumps(c.suggested_actions),
            context=context,
        ))

    formatted_conflicts = [
        {
            "conflict_uid": c.conflict_uid,
            "conflict_type": c.conflict_type.value,
            "severity": c.severity.value,
            "trains": c.trains,
            "train_1_number": c.trains[0] if c.trains else "",
            "train_2_number": c.trains[1] if len(c.trains) > 1 else "",
            "resource_code": c.resource_code,
            "block_code": c.resource_code if (c.resource_code.startswith("BLK") or c.resource_code.startswith("SEC")) else None,
            "station_code": c.resource_code if not (c.resource_code.startswith("BLK") or c.resource_code.startswith("SEC")) else None,
            "interval_start_min": c.interval_start_min,
            "interval_end_min": c.interval_end_min,
            "start_time_min": c.interval_start_min,
            "end_time_min": c.interval_end_min,
            "explanation": c.explanation,
            "rule_source": c.rule_source,
            "suggested_actions": c.suggested_actions,
            "suggested_action": c.suggested_actions[0] if c.suggested_actions else "",
        }
        for c in scenario_conflicts
    ]

    # Build comparison result
    comparison = {
        "scenario_id": scenario.id,
        "scenario_type": scenario_type,
        "parameters": params,
        "baseline": {
            "conflict_count": len(baseline_conflicts),
        },
        "disrupted": {
            "conflict_count": len(scenario_conflicts),
            "new_conflicts": max(0, len(scenario_conflicts) - len(baseline_conflicts)),
        },
        "conflicts": formatted_conflicts,
        "conflicts_count": len(scenario_conflicts),
        "explanation": (
            f"Scenario '{scenario.name}' ({scenario_type}) applied. "
            f"Baseline conflicts: {len(baseline_conflicts)}. "
            f"After disruption: {len(scenario_conflicts)} "
            f"({'increase of ' + str(len(scenario_conflicts)-len(baseline_conflicts)) if len(scenario_conflicts) > len(baseline_conflicts) else 'no change'}). "
            "Data provenance: DERIVED from timetable; infrastructure ASSUMED."
        ),
    }

    scenario.status = "completed"
    scenario.result_json = json.dumps(comparison)

    ev = SystemEvent(
        category="scenario",
        level="info",
        message=f"Scenario {scenario.id} '{scenario.name}' ran: "
                f"{len(scenario_conflicts)} conflicts detected.",
        reference_id=str(scenario.id),
    )
    db.add(ev)
    db.commit()
    return comparison


def apply_scenario_service(db: Session, scenario: Scenario) -> dict:
    """Apply the scenario perturbations directly to the active live database timetable and blocks."""
    params = json.loads(scenario.parameters_json)
    train_number = params.get("train_number")
    delay_min = params.get("delay_min")
    block_code = params.get("block_code")

    affected_trains = 0
    if train_number and train_number != "none" and delay_min:
        delay_val = int(delay_min)
        train = db.query(Train).filter(Train.train_number == train_number).first()
        if train:
            stops = db.query(StopTime).filter(StopTime.train_id == train.id).all()
            for st in stops:
                if st.planned_departure_min is not None:
                    st.revised_departure_min = st.planned_departure_min + delay_val
                if st.planned_arrival_min is not None:
                    st.revised_arrival_min = st.planned_arrival_min + delay_val
            affected_trains = len(stops)

    affected_blocks = 0
    if block_code and block_code != "none":
        blk = db.query(Block).filter(Block.code == block_code).first()
        if blk:
            blk.state = "closed"
            affected_blocks += 1
        from app.services.simulation import simulation_service
        simulation_service.close_block(block_code)

    # Re-detect conflicts and update baseline context so the entire dashboard reflects the scenario
    from app.api.conflicts import detect_conflicts
    detect_res = detect_conflicts(use_revised=True, context="baseline", db=db)

    ev = SystemEvent(
        category="scenario",
        level="warning",
        message=f"Scenario {scenario.id} applied to active network: {detect_res.get('count', 0)} active conflicts.",
        reference_id=str(scenario.id),
    )
    db.add(ev)
    db.commit()

    return {
        "status": "applied",
        "scenario_id": scenario.id,
        "affected_train_stops": affected_trains,
        "affected_blocks": affected_blocks,
        "active_conflicts": detect_res.get("count", 0),
    }


def reset_scenario_service(db: Session) -> dict:
    """Reset all train delays, re-open all blocks, and re-run baseline conflict detection."""
    # Reset revised stop times
    stops = db.query(StopTime).all()
    for st in stops:
        st.revised_departure_min = None
        st.revised_arrival_min = None

    # Re-open all blocks
    blocks = db.query(Block).all()
    for blk in blocks:
        blk.state = "available"

    from app.services.simulation import simulation_service
    for blk in blocks:
        simulation_service.open_block(blk.code)

    from app.api.conflicts import detect_conflicts
    detect_res = detect_conflicts(use_revised=False, context="baseline", db=db)

    ev = SystemEvent(
        category="scenario",
        level="info",
        message="Active scenario reset. Network restored to baseline timetable.",
    )
    db.add(ev)
    db.commit()

    return {
        "status": "reset",
        "message": "Network restored to baseline timetable. All blocks available.",
        "baseline_conflicts": detect_res.get("count", 0),
    }
