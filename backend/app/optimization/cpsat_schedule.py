"""CP-SAT schedule optimizer.

Builds an interval-variable model for block occupancy, adds no-overlap
constraints per exclusive block, headway constraints, and minimizes
weighted delay + timetable change penalty + waiting penalty.

Supports both:
- 'interval' model: Multi-stop interval model with stop dwell flexibility and native NoOverlap intervals.
- 'scalar' model: Legacy scalar shift model preserved behind flag for backward compatibility and differential testing.

All times in integer minutes from midnight.
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

HORIZON = 2880  # 48-hour horizon to prevent midnight-crossing boundary clipping


def optimize_schedule(db: Session, weights: dict[str, float] | None = None) -> dict[str, Any]:
    """Run CP-SAT schedule optimization.

    Args:
        db:      Database session.
        weights: {delay_weight, timetable_change_penalty, waiting_penalty, model_type, ...}.

    Returns:
        Dict with solver_status, solve_time_s, objective_value,
        delay_before_min, delay_after_min, conflicts_before, conflicts_after,
        revised_schedule, explanation.
    """
    if weights is None:
        weights = {}

    model_type = weights.get("model_type", "interval")
    if model_type == "scalar":
        return _optimize_schedule_scalar(db, weights)
    return _optimize_schedule_interval(db, weights)


def _optimize_schedule_interval(db: Session, weights: dict[str, float]) -> dict[str, Any]:
    """Multi-stop interval model using CP-SAT with native NoOverlap and solution hints."""
    delay_w = float(weights.get("delay_weight", 1.0))
    change_w = float(weights.get("timetable_change_penalty", 0.5))
    max_delay = int(weights.get("max_delay_min", 120))
    time_limit = min(settings.cpsat_time_limit_s, float(weights.get("time_limit_s", 30.0)))
    num_workers = int(weights.get("num_workers", 1))

    station_map = {s.id: s.code for s in db.query(Station).all()}
    trains_raw = db.query(Train).filter(Train.is_active == True).all()  # noqa: E712
    train_map = {t.id: t for t in trains_raw}
    sections_raw = db.query(TrackSection).all()
    blocks_raw = db.query(Block).all()
    stops_raw = db.query(StopTime).all()

    # Plain-dict representations
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
    section_rt: dict[tuple[str, str], int] = {}
    section_hw: dict[tuple[str, str], int] = {}
    section_dt: dict[tuple[str, str], bool] = {}
    for s in section_dicts:
        f = s["from_station_code"]
        t = s["to_station_code"]
        section_rt[(f, t)] = s["running_time_min"]
        section_rt[(t, f)] = s["running_time_min"]
        section_hw[(f, t)] = s["headway_min"]
        section_hw[(t, f)] = s["headway_min"]
        section_dt[(f, t)] = s["is_double_track"]
        section_dt[(t, f)] = s["is_double_track"]

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

    # Gather maintenance closure windows: (block_code, start_min, end_min)
    maintenance_windows: list[tuple[str, int, int]] = []
    closed_blocks: set[str] = set()

    for b in blocks_raw:
        if b.state == "closed":
            closed_blocks.add(b.code)
            maintenance_windows.append((b.code, 0, HORIZON))

    extra_closed = weights.get("closed_blocks", [])
    if isinstance(extra_closed, (list, set)):
        for cb in extra_closed:
            closed_blocks.add(str(cb))
            maintenance_windows.append((str(cb), 0, HORIZON))

    try:
        from app.models.maintenance import MaintenanceJob, MaintenancePlan
        m_plans = db.query(MaintenancePlan).all()
        for mp in m_plans:
            job = mp.job
            if job and job.block_codes_json:
                try:
                    b_codes = json.loads(job.block_codes_json)
                    for b_code in b_codes:
                        closed_blocks.add(str(b_code))
                        maintenance_windows.append((
                            str(b_code),
                            int(mp.assigned_start_min),
                            int(mp.assigned_end_min),
                        ))
                except Exception:
                    pass
        active_jobs = db.query(MaintenanceJob).filter(MaintenanceJob.status == "active").all()
        for aj in active_jobs:
            if aj.block_codes_json:
                try:
                    b_codes = json.loads(aj.block_codes_json)
                    s_min = int(aj.earliest_start_min)
                    e_min = min(HORIZON, s_min + int(aj.duration_min))
                    for b_code in b_codes:
                        closed_blocks.add(str(b_code))
                        maintenance_windows.append((str(b_code), s_min, e_min))
                except Exception:
                    pass
    except Exception:
        pass

    custom_windows = weights.get("maintenance_windows", [])
    if isinstance(custom_windows, list):
        for cw in custom_windows:
            if isinstance(cw, dict) and "block_code" in cw:
                b_code = str(cw["block_code"])
                s_min = int(cw.get("start_min", 0))
                e_min = int(cw.get("end_min", HORIZON))
                closed_blocks.add(b_code)
                maintenance_windows.append((b_code, s_min, e_min))

    baseline_conflicts = detect_all(trains_dicts, stop_dicts, section_dicts, block_dicts,
                                    closed_blocks=maintenance_windows, use_revised=False)

    # --- BUILD INTERVAL CP-SAT MODEL ---
    model = cp_model.CpModel()

    # Decision variables per stop: arrival and departure times
    arr_vars: dict[tuple[str, int], cp_model.IntVar] = {}
    dep_vars: dict[tuple[str, int], cp_model.IntVar] = {}

    # Block occupancy interval variables: block_code -> list of IntervalVar
    block_intervals: dict[str, list[cp_model.IntervalVar]] = {}
    # Headway interval variables: (block_code, direction) -> list of IntervalVar
    headway_intervals: dict[tuple[str, str], list[cp_model.IntervalVar]] = {}

    # Store entry variables per block to record revised schedule
    block_entry_records: list[dict[str, Any]] = []

    # Track station platform dwell intervals
    station_dwell_intervals: dict[str, list[cp_model.IntervalVar]] = {}
    # Track single-track section traversals for opposing movement deadlock prevention
    section_traversals: dict[tuple[str, str], list[dict[str, Any]]] = {}

    objective_terms: list[cp_model.LinearExpr] = []

    for t in trains_raw:
        tn = t.train_number
        direction = t.direction
        prio = int(t.priority) if t.priority else 5
        stops = stops_by_train.get(tn, [])
        if len(stops) < 2:
            continue

        for i, st in enumerate(stops):
            p_arr = st.planned_arrival_min if st.planned_arrival_min is not None else st.planned_departure_min or 0
            p_dep = st.planned_departure_min if st.planned_departure_min is not None else st.planned_arrival_min or 0
            dwell = max(1, st.dwell_min if st.dwell_min is not None else 2)
            stn_code = station_map.get(st.station_id, "")

            # Bounded arrival and departure variables [planned, planned + max_delay]
            av = model.new_int_var(p_arr, p_arr + max_delay, f"arr_{tn}_{i}")
            dv = model.new_int_var(p_dep, p_dep + max_delay, f"dep_{tn}_{i}")
            arr_vars[(tn, i)] = av
            dep_vars[(tn, i)] = dv

            # Solution hint: start from planned schedule
            model.add_hint(av, p_arr)
            model.add_hint(dv, p_dep)

            # Minimum dwell & platform capacity constraint
            if i > 0 and i < len(stops) - 1:
                dwell_dur = model.new_int_var(dwell, max_delay + dwell, f"ddur_{tn}_{i}")
                model.add(dv == av + dwell_dur)
                dwell_iv = model.new_interval_var(av, dwell_dur, dv, f"stn_iv_{tn}_{stn_code}_{i}")
                station_dwell_intervals.setdefault(stn_code, []).append(dwell_iv)
            elif i == 0:
                orig_start = model.new_int_var(0, HORIZON, f"orig_start_{tn}")
                model.add_max_equality(orig_start, [dv - dwell, 0])
                orig_iv = model.new_fixed_size_interval_var(orig_start, dwell, f"orig_iv_{tn}_{stn_code}")
                station_dwell_intervals.setdefault(stn_code, []).append(orig_iv)
            else:
                term_iv = model.new_fixed_size_interval_var(av, dwell, f"term_iv_{tn}_{stn_code}_{i}")
                station_dwell_intervals.setdefault(stn_code, []).append(term_iv)

            # Objective: penalize timetable departure shift only for intermediate and origin departures
            if i < len(stops) - 1:
                objective_terms.append(int(change_w * 10) * (dv - p_dep))

        # Objective: priority-weighted arrival delay at final terminus
        final_idx = len(stops) - 1
        final_planned_arr = stops[final_idx].planned_arrival_min or stops[final_idx].planned_departure_min or 0
        final_arr_var = arr_vars[(tn, final_idx)]
        objective_terms.append(int(delay_w * prio * 10) * (final_arr_var - final_planned_arr))

        # Route continuity across sections and blocks
        for i in range(len(stops) - 1):
            cur_dep = dep_vars[(tn, i)]
            nxt_arr = arr_vars[(tn, i + 1)]
            from_st = station_map.get(stops[i].station_id, "")
            to_st = station_map.get(stops[i + 1].station_id, "")

            rt = section_rt.get((from_st, to_st), 60)
            hw = section_hw.get((from_st, to_st), 5)
            is_dt = section_dt.get((from_st, to_st), False)

            # Determine blocks for section with directional reversal
            is_reversed = False
            sec_blocks = [b for b in block_dicts if (b["section_from"] == from_st and b["section_to"] == to_st)]
            if not sec_blocks:
                sec_blocks = [b for b in block_dicts if (b["section_from"] == to_st and b["section_to"] == from_st)]
                is_reversed = True

            sec_blocks.sort(key=lambda b: b["block_index"])
            if is_reversed:
                sec_blocks = list(reversed(sec_blocks))

            # Traverse time across blocks: exact integer partition of rt
            cum_traverse = 0
            block_traversals = []
            for idx_b, blk in enumerate(sec_blocks):
                if idx_b == len(sec_blocks) - 1:
                    dur = max(1, rt - cum_traverse)
                else:
                    dur = max(1, round(rt * blk["time_fraction"]))
                block_traversals.append((blk, dur, cum_traverse))
                cum_traverse += dur

            total_section_time = max(rt, cum_traverse)
            # Travel continuity: arrival at next station = departure from current + section time
            model.add(nxt_arr == cur_dep + total_section_time)

            # Collect traversals for single-track opposing movement exclusion
            if not is_dt:
                canon_sec = tuple(sorted([from_st, to_st]))
                section_traversals.setdefault(canon_sec, []).append({
                    "tn": tn,
                    "from_st": from_st,
                    "to_st": to_st,
                    "dep": cur_dep,
                    "arr": nxt_arr,
                    "planned_dep": stops[i].planned_departure_min or 0,
                    "planned_arr": stops[i + 1].planned_arrival_min or 0,
                })

            # Create block interval variables
            for blk, dur, offset in block_traversals:
                raw_code = blk["code"]
                # For double-track sections, directional line is distinct
                blk_key = raw_code if not is_dt else f"{raw_code}-{direction.upper()}"

                blk_entry = model.new_int_var(0, HORIZON, f"bentry_{tn}_{blk_key}")
                model.add(blk_entry == cur_dep + offset)

                iv = model.new_fixed_size_interval_var(blk_entry, dur, f"biv_{tn}_{blk_key}")
                block_intervals.setdefault(blk_key, []).append(iv)

                # Same-direction entry headway interval: prevents trains following within < hw
                hw_iv = model.new_fixed_size_interval_var(blk_entry, hw, f"hwiv_{tn}_{blk_key}")
                headway_intervals.setdefault((blk_key, direction), []).append(hw_iv)

    # Inject hard maintenance closure intervals
    for b_code, s_min, e_min in maintenance_windows:
        if s_min >= HORIZON:
            continue
        cl_start = max(0, min(HORIZON - 1, s_min))
        cl_end = max(cl_start + 1, min(HORIZON, e_min))
        dur = cl_end - cl_start

        # Target matching block keys (single track raw code or double track UP/DOWN)
        matching_keys = [k for k in block_intervals if k == b_code or k.startswith(f"{b_code}-")]
        if not matching_keys:
            matching_keys = [b_code]
        for k in matching_keys:
            m_iv = model.new_fixed_size_interval_var(cl_start, dur, f"maint_close_{k}_{cl_start}")
            block_intervals.setdefault(k, []).append(m_iv)

    # 1. NoOverlap on single-track blocks and maintenance closures
    for blk_key, ivs in block_intervals.items():
        if len(ivs) > 1:
            has_maint = any(iv.name.startswith("maint_close_") for iv in ivs)
            is_single_track = not blk_key.endswith("-UP") and not blk_key.endswith("-DOWN")
            if is_single_track or has_maint:
                model.add_no_overlap(ivs)

    # 2. NoOverlap on same-direction headway intervals across all blocks
    for (blk_key, dirn), hw_ivs in headway_intervals.items():
        if len(hw_ivs) > 1:
            model.add_no_overlap(hw_ivs)

    # 3. Cumulative station platform and passing loop capacity constraints
    station_capacity = {
        s.code: max(1, (s.platform_count or 1) + (1 if s.has_passing_loop else 0))
        for s in db.query(Station).all()
    }
    for stn_code, ivs in station_dwell_intervals.items():
        cap = station_capacity.get(stn_code, 1)
        if len(ivs) > cap:
            model.add_cumulative(ivs, [1] * len(ivs), cap)

    # 4. Single-track opposing movement exclusion (meet-and-pass at loop stations only)
    for canon_sec, travs in section_traversals.items():
        for idx_a in range(len(travs)):
            for idx_b in range(idx_a + 1, len(travs)):
                ta = travs[idx_a]
                tb = travs[idx_b]
                # Only constrain if traveling in OPPOSITE directions
                if ta["from_st"] == tb["to_st"] and ta["to_st"] == tb["from_st"]:
                    b_opp = model.new_bool_var(f"opp_{canon_sec[0]}_{canon_sec[1]}_{ta['tn']}_{tb['tn']}")
                    model.add(ta["arr"] <= tb["dep"]).only_enforce_if(b_opp)
                    model.add(tb["arr"] <= ta["dep"]).only_enforce_if(b_opp.negated())

                    if ta["planned_arr"] <= tb["planned_dep"]:
                        model.add_hint(b_opp, 1)
                    else:
                        model.add_hint(b_opp, 0)

    # Objective minimization
    if objective_terms:
        model.minimize(sum(objective_terms))

    # Configure solver
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.random_seed = int(weights.get("random_seed", settings.seed_random_seed))
    solver.parameters.num_search_workers = num_workers

    t0 = time.perf_counter()
    status = solver.solve(model)
    solve_time = time.perf_counter() - t0

    status_str = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "UNKNOWN",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
    }.get(status, "UNKNOWN")

    revised_schedule: list[dict] = []
    total_assigned_delay = 0.0

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for t in trains_raw:
            tn = t.train_number
            stops = stops_by_train.get(tn, [])
            for i, stop in enumerate(stops):
                if (tn, i) in dep_vars:
                    sol_dep = int(solver.value(dep_vars[(tn, i)]))
                    sol_arr = int(solver.value(arr_vars[(tn, i)]))
                    planned_dep = stop.planned_departure_min or stop.planned_arrival_min or sol_dep
                    total_assigned_delay += max(0, sol_dep - planned_dep)

                    revised_schedule.append({
                        "train_number": tn,
                        "station_code": station_map.get(stop.station_id, ""),
                        "stop_sequence": stop.stop_sequence,
                        "planned_arrival_min": stop.planned_arrival_min,
                        "planned_departure_min": stop.planned_departure_min,
                        "revised_arrival_min": sol_arr,
                        "revised_departure_min": sol_dep,
                    })

                    # Persist in DB
                    stop.revised_arrival_min = sol_arr
                    stop.revised_departure_min = sol_dep
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
                                    closed_blocks=maintenance_windows, use_revised=True)

        # Synchronize ConflictRecord table so Conflict Radar and Stringline reflect verified state
        from app.models.conflicts import ConflictRecord
        db.query(ConflictRecord).filter(ConflictRecord.context == "baseline").delete()
        for pc in post_conflicts:
            db.add(ConflictRecord(
                conflict_uid=pc.conflict_uid,
                conflict_type=pc.conflict_type.value if hasattr(pc.conflict_type, "value") else str(pc.conflict_type),
                severity=pc.severity.value if hasattr(pc.severity, "value") else str(pc.severity),
                trains_json=json.dumps(pc.trains),
                resource_code=pc.resource_code,
                interval_start_min=pc.interval_start_min,
                interval_end_min=pc.interval_end_min,
                explanation=pc.explanation,
                rule_source=pc.rule_source,
                suggested_actions_json=json.dumps(pc.suggested_actions),
                context="baseline",
            ))
        db.commit()

        # Run independent verification engine (plain Python, no OR-Tools)
        from app.domain.verifier import verify_schedule_integrity
        station_dicts = [
            {"code": s.code, "name": s.name, "platform_count": s.platform_count, "has_passing_loop": s.has_passing_loop}
            for s in db.query(Station).all()
        ]
        maint_window_dicts = [
            {"block_code": bc, "start_min": sm, "end_min": em}
            for bc, sm, em in maintenance_windows
        ]
        ver_res = verify_schedule_integrity(
            trains=trains_dicts,
            stop_times=revised_stop_dicts,
            sections=section_dicts,
            blocks=block_dicts,
            stations=station_dicts,
            closed_windows=maint_window_dicts,
        )

        base_explanation = _build_explanation(
            status_str, len(trains_raw), len(baseline_conflicts),
            len(post_conflicts), float(total_assigned_delay), solve_time, weights
        )

        final_status = status_str
        if not ver_res.is_valid:
            final_status = "VERIFICATION_FAILED"
            explanation = (
                f"[INDEPENDENT VERIFICATION FAILED: {ver_res.violation_count} safety violations detected] "
                + base_explanation
            )
        else:
            explanation = (
                f"[INDEPENDENT VERIFICATION PASSED: 0 safety violations across {len(ver_res.checks_passed)} checks] "
                + base_explanation
            )

        return {
            "solver_status": final_status,
            "solve_time_s": round(solve_time, 3),
            "objective_value": float(solver.objective_value) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            "delay_before_min": float(sum(
                (s.revised_arrival_min or s.planned_arrival_min or 0) - (s.planned_arrival_min or 0)
                for s in db.query(StopTime).all()
                if s.revised_arrival_min and s.planned_arrival_min
            ) / max(1, len(trains_raw))),
            "delay_after_min": round(total_assigned_delay / max(1, len(trains_raw)), 1),
            "conflicts_before": len(baseline_conflicts),
            "conflicts_after": len(post_conflicts),
            "revised_schedule": revised_schedule,
            "explanation": explanation,
            "verified": ver_res.is_valid,
            "verification_report": ver_res.to_dict(),
        }
    else:
        explanation = (
            f"CP-SAT returned {status_str} after {solve_time:.1f}s. "
            "The schedule is constrained under current parameters. "
            "Consider increasing allowable delay window."
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


def _optimize_schedule_scalar(db: Session, weights: dict[str, float]) -> dict[str, Any]:
    """Legacy scalar delay model preserved behind flag for backward compatibility and differential testing."""
    delay_w = float(weights.get("delay_weight", 1.0))
    time_limit = min(settings.cpsat_time_limit_s, float(weights.get("time_limit_s", 30.0)))

    station_map = {s.id: s.code for s in db.query(Station).all()}
    trains_raw = db.query(Train).filter(Train.is_active == True).all()  # noqa: E712
    train_map = {t.id: t for t in trains_raw}
    sections_raw = db.query(TrackSection).all()
    blocks_raw = db.query(Block).all()
    stops_raw = db.query(StopTime).all()

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

    closed_blocks = {b.code for b in blocks_raw if b.state == "closed"}
    baseline_conflicts = detect_all(trains_dicts, stop_dicts, section_dicts, block_dicts,
                                    closed_blocks=closed_blocks, use_revised=False)

    model = cp_model.CpModel()
    MAX_DELAY = 120
    delay_vars: dict[str, cp_model.IntVar] = {}
    for t in trains_raw:
        delay_vars[t.train_number] = model.new_int_var(0, MAX_DELAY, f"delay_{t.train_number}")

    block_intervals: dict[str, list[tuple[str, cp_model.IntervalVar, int, int]]] = {}

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
            sec_blocks = [b for b in block_dicts if (
                (b["section_from"] == from_st and b["section_to"] == to_st) or
                (b["section_from"] == to_st and b["section_to"] == from_st)
            )]
            sec_blocks.sort(key=lambda b: b["block_index"])

            t_within_section = 0
            for blk in sec_blocks:
                traverse = max(1, round(rt * blk["time_fraction"]))
                entry_planned = dep_planned + t_within_section

                entry_var = model.new_int_var(0, HORIZON, f"entry_{tn}_{blk['code']}")
                model.add(entry_var == entry_planned + dv)

                interval_var = model.new_fixed_size_interval_var(
                    entry_var, traverse, f"interval_{tn}_{blk['code']}"
                )
                block_intervals.setdefault(blk["code"], []).append(
                    (tn, interval_var, entry_planned, entry_planned + traverse)
                )
                t_within_section += traverse

    for block_code, items in block_intervals.items():
        blk_meta = next((b for b in block_dicts if b["code"] == block_code), None)
        if not blk_meta:
            continue
        key = (blk_meta["section_from"], blk_meta["section_to"])
        is_dt = section_dt.get(key, False)
        if is_dt:
            continue
        if len(items) > 1:
            model.add_no_overlap([item[1] for item in items])

    total_delay_expr = sum(
        int(t.priority) * delay_vars[t.train_number] for t in trains_raw
    )
    model.minimize(total_delay_expr)

    solver_obj = cp_model.CpSolver()
    solver_obj.parameters.max_time_in_seconds = time_limit
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
                stop.revised_arrival_min = rev_arr
                stop.revised_departure_min = rev_dep
        db.commit()

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
        explanation = f"CP-SAT returned {status_str} after {solve_time:.1f}s."
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
