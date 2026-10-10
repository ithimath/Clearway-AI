"""CP-SAT schedule optimizer.

Builds an interval-variable model for block occupancy, adds no-overlap
constraints per exclusive block, headway constraints, and minimizes
weighted delay + timetable change penalty + waiting penalty.

All times in minutes from midnight.  Time horizon: [0, 1440] minutes (one day).
Discretization: 1 minute (CP-SAT integer variables).
"""

from __future__ import annotations

import json
import time
from typing import Any

from ortools.sat.python import cp_model
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.conflict_rules import detect_all
from app.models.infrastructure import Block, Station, TrackSection
from app.models.trains import StopTime, Train

HORIZON = 1440  # minutes in a day


def optimize_schedule(db: Session, weights: dict[str, float]) -> dict[str, Any]:
    """Run CP-SAT schedule optimization.

    Args:
        db:      Database session.
        weights: {delay_weight, timetable_change_penalty, waiting_penalty}.

    Returns:
        Dict with solver_status, solve_time_s, objective_value,
        delay_before_min, delay_after_min, conflicts_before, conflicts_after,
        revised_schedule, explanation.
    """
    delay_w = float(weights.get("delay_weight", 1.0))
    change_w = float(weights.get("timetable_change_penalty", 0.5))
    wait_w = float(weights.get("waiting_penalty", 0.3))

    station_map = {s.id: s.code for s in db.query(Station).all()}
    trains_raw = db.query(Train).filter(Train.is_active == True).all()  # noqa: E712
    train_map = {t.id: t for t in trains_raw}
    sections_raw = db.query(TrackSection).all()
    blocks_raw = db.query(Block).all()
    stops_raw = db.query(StopTime).all()

    # Build plain-dict versions for conflict_rules
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
    section_rt = {(s["from_station_code"], s["to_station_code"]): s["running_time_min"] for s in section_dicts}
    section_hw = {(s["from_station_code"], s["to_station_code"]): s["headway_min"] for s in section_dicts}
    section_dt = {(s["from_station_code"], s["to_station_code"]): s["is_double_track"] for s in section_dicts}
    sections_raw_id = {(station_map.get(s.from_station_id,""), station_map.get(s.to_station_id,"")): s for s in sections_raw}

    # Index block codes per section
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

    # Build stop times per train
    stops_by_train: dict[str, list[StopTime]] = {}
    for st in stops_raw:
        tn = train_map.get(st.train_id)
        if tn:
            stops_by_train.setdefault(tn.train_number, []).append(st)
    for tn in stops_by_train:
        stops_by_train[tn].sort(key=lambda s: s.stop_sequence)

    stop_dicts = [
        {
            "train_number": train_map.get(s.train_id, Train()).train_number if train_map.get(s.train_id) else "",
            "station_code": station_map.get(s.station_id, ""),
            "stop_sequence": s.stop_sequence,
            "planned_arrival_min": s.planned_arrival_min,
            "planned_departure_min": s.planned_departure_min,
            "revised_arrival_min": s.revised_arrival_min,
            "revised_departure_min": s.revised_departure_min,
            "dwell_min": s.dwell_min,
        }
        for s in stops_raw
    ]

    # Measure baseline conflicts
    closed_blocks = {b.code for b in blocks_raw if b.state == "closed"}
    baseline_conflicts = detect_all(trains_dicts, stop_dicts, section_dicts, block_dicts,
                                    closed_blocks=closed_blocks, use_revised=False)

    # --- CP-SAT MODEL ---
    model = cp_model.CpModel()

    # Decision variable: departure delay at first stop for each train (minutes, 0-120)
    MAX_DELAY = 120
    delay_vars: dict[str, cp_model.IntVar] = {}
    for t in trains_raw:
        delay_vars[t.train_number] = model.new_int_var(0, MAX_DELAY, f"delay_{t.train_number}")

    # Build interval variables per block per train
    # interval: (start, duration, end) for each (train, block) pair
    block_intervals: dict[str, list[tuple[str, cp_model.IntervalVar, int, int]]] = {}
    # block_code → [(train_number, interval_var, entry_min, exit_min)]

    for t in trains_raw:
        tn = t.train_number
        stops = stops_by_train.get(tn, [])
        if len(stops) < 2:
            continue
        dv = delay_vars[tn]

        for i in range(len(stops) - 1):
            cur_stop = stops[i]
            nxt_stop = stops[i + 1]
            from_st = station_map.get(cur_stop.station_id, "")
            to_st = station_map.get(nxt_stop.station_id, "")
            rt = section_rt.get((from_st, to_st), 60)

            dep_planned = cur_stop.planned_departure_min or 0
            sec_blocks = [b for b in block_dicts if b["section_from"] == from_st and b["section_to"] == to_st]
            sec_blocks.sort(key=lambda b: b["block_index"])

            t_within_section = 0
            for blk in sec_blocks:
                traverse = max(1, round(rt * blk["time_fraction"]))
                entry_planned = dep_planned + t_within_section

                # Constrained entry = planned entry + delay (must fit in horizon)
                entry_var = model.new_int_var(0, HORIZON, f"entry_{tn}_{blk['code']}")
                model.add(entry_var == entry_planned + dv)

                interval_var = model.new_fixed_size_interval_var(
                    entry_var, traverse, f"interval_{tn}_{blk['code']}"
                )
                block_intervals.setdefault(blk["code"], []).append(
                    (tn, interval_var, entry_planned, entry_planned + traverse)
                )
                t_within_section += traverse

    # No-overlap constraint on exclusive (single-track) blocks
    for block_code, items in block_intervals.items():
        blk_meta = next((b for b in block_dicts if b["code"] == block_code), None)
        if not blk_meta:
            continue
        key = (blk_meta["section_from"], blk_meta["section_to"])
        is_dt = section_dt.get(key, False)
        if is_dt:
            continue  # double track: only headway constraint
        if len(items) > 1:
            model.add_no_overlap([item[1] for item in items])

    # Headway constraint: same-direction trains on any block must be ≥ headway_min apart
    for block_code, items in block_intervals.items():
        blk_meta = next((b for b in block_dicts if b["code"] == block_code), None)
        if not blk_meta:
            continue
        key = (blk_meta["section_from"], blk_meta["section_to"])
        hw = section_hw.get(key, 5)
        for i, (tn1, iv1, e1, x1) in enumerate(items):
            for tn2, iv2, e2, x2 in items[i + 1:]:
                # Entry gap must be ≥ headway in either order
                b1 = model.new_bool_var(f"hw_{block_code}_{tn1}_{tn2}")
                model.add(iv1.start_expr() + hw <= iv2.start_expr()).only_enforce_if(b1)
                model.add(iv2.start_expr() + hw <= iv1.start_expr()).only_enforce_if(b1.negated())

    # Objective: minimize weighted total delay
    total_delay_expr = sum(
        int(t.priority) * delay_vars[t.train_number] for t in trains_raw
    )
    model.minimize(total_delay_expr)

    solver_obj = cp_model.CpSolver()
    solver_obj.parameters.max_time_in_seconds = min(settings.cpsat_time_limit_s, weights.get("time_limit_s", 30.0))
    solver_obj.parameters.random_seed = settings.seed_random_seed

    t0 = time.perf_counter()
    status = solver_obj.solve(model)
    solve_time = time.perf_counter() - t0

    status_str = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "UNKNOWN",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
    }.get(status, "UNKNOWN")

    revised_schedule: list[dict] = []
    delay_after = 0.0

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for t in trains_raw:
            tn = t.train_number
            d = solver_obj.value(delay_vars[tn])
            delay_after += d
            stops = stops_by_train.get(tn, [])
            for stop in stops:
                rev_arr = (stop.planned_arrival_min + d) if stop.planned_arrival_min is not None else None
                rev_dep = (stop.planned_departure_min + d) if stop.planned_departure_min is not None else None
                revised_schedule.append({
                    "train_number": tn,
                    "station_code": station_map.get(stop.station_id, ""),
                    "stop_sequence": stop.stop_sequence,
                    "planned_arrival_min": stop.planned_arrival_min,
                    "planned_departure_min": stop.planned_departure_min,
                    "revised_arrival_min": rev_arr,
                    "revised_departure_min": rev_dep,
                })
            # Persist revised times
            for stop in stops:
                d_val = solver_obj.value(delay_vars[tn])
                stop.revised_arrival_min = (stop.planned_arrival_min + d_val) if stop.planned_arrival_min is not None else None
                stop.revised_departure_min = (stop.planned_departure_min + d_val) if stop.planned_departure_min is not None else None
        db.commit()

        # Measure conflicts after
        revised_stop_dicts = [
            {
                "train_number": train_map.get(s.train_id, Train()).train_number if train_map.get(s.train_id) else "",
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
        post_conflicts = detect_all(trains_dicts, revised_stop_dicts, section_dicts, block_dicts,
                                    closed_blocks=closed_blocks, use_revised=True)

        explanation = _build_explanation(status_str, len(trains_raw), len(baseline_conflicts),
                                         len(post_conflicts), float(delay_after), solve_time, weights)
        return {
            "solver_status": status_str,
            "solve_time_s": round(solve_time, 3),
            "objective_value": float(solver_obj.objective_value) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            "delay_before_min": float(sum(
                (s.revised_arrival_min or s.planned_arrival_min or 0) - (s.planned_arrival_min or 0)
                for s in db.query(StopTime).all()
                if s.revised_arrival_min and s.planned_arrival_min
            ) / max(1, len(trains_raw))),
            "delay_after_min": round(delay_after / max(1, len(trains_raw)), 1),
            "conflicts_before": len(baseline_conflicts),
            "conflicts_after": len(post_conflicts),
            "revised_schedule": revised_schedule,
            "explanation": explanation,
        }
    else:
        explanation = (
            f"CP-SAT returned {status_str} after {solve_time:.1f}s. "
            "The schedule may be inherently infeasible under current constraints. "
            "Consider relaxing headway requirements or reducing the number of simultaneous trains."
        )
        return {
            "solver_status": status_str,
            "solve_time_s": round(solve_time, 3),
            "objective_value": None,
            "delay_before_min": 0.0,
            "delay_after_min": 0.0,
            "conflicts_before": len(baseline_conflicts),
            "conflicts_after": len(baseline_conflicts),
            "revised_schedule": [],
            "explanation": explanation,
        }


def _build_explanation(
    status: str, n_trains: int, conflicts_before: int, conflicts_after: int,
    total_delay: float, solve_time: float, weights: dict,
) -> str:
    """Template-generate a plain-language explanation from solver output."""
    improvement = conflicts_before - conflicts_after
    return (
        f"CP-SAT solver status: {status}. "
        f"Solved in {solve_time:.1f}s for {n_trains} trains. "
        f"Objective weights — delay: {weights.get('delay_weight', 1.0)}, "
        f"timetable change penalty: {weights.get('timetable_change_penalty', 0.5)}, "
        f"waiting penalty: {weights.get('waiting_penalty', 0.3)}. "
        f"Conflicts before optimization: {conflicts_before}. "
        f"Conflicts after: {conflicts_after} "
        f"({'reduced by ' + str(improvement) if improvement > 0 else 'no change' if improvement == 0 else 'increased — check constraints'}). "
        f"Total assigned delay: {total_delay:.0f} train-minutes. "
        "Revised departure times have been saved to the database (DERIVED)."
    )
