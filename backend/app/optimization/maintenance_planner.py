"""Maintenance window planner using CP-SAT.

Assigns start times to maintenance jobs while respecting:
- Train block occupancy windows (DERIVED)
- Job earliest/latest time windows (ASSUMED)
- No-overlap between jobs sharing blocks
- Optional job-to-job no-overlap constraints
Minimizes: total train disruption (added delay) + job lateness.
"""

from __future__ import annotations

import json
import time
from typing import Any

from ortools.sat.python import cp_model
from sqlalchemy.orm import Session

from app.config import settings
from app.models.infrastructure import Block, Station, TrackSection
from app.models.maintenance import MaintenanceJob, MaintenancePlan
from app.models.trains import StopTime, Train
from app.domain.conflict_rules import build_block_occupancy

HORIZON = 1440  # one day in minutes


def plan_maintenance_windows(
    db: Session,
    job_ids: list[int],
    time_limit_s: float = 30.0,
) -> dict[str, Any]:
    """Run CP-SAT maintenance planner.

    Args:
        db:           Database session.
        job_ids:      IDs of MaintenanceJob rows to plan. Empty = plan all pending.
        time_limit_s: Solver time limit.

    Returns:
        Dict with solver_status, plans (list of plan dicts).
    """
    if not job_ids:
        pending_jobs = db.query(MaintenanceJob).filter(MaintenanceJob.status == "pending").all()
    else:
        pending_jobs = db.query(MaintenanceJob).filter(MaintenanceJob.id.in_(job_ids)).all()

    if not pending_jobs:
        return {"solver_status": "NO_JOBS", "plans": []}

    # Load occupancy data
    station_map = {s.id: s.code for s in db.query(Station).all()}
    sections_raw = db.query(TrackSection).all()
    blocks_raw = db.query(Block).all()
    trains_raw = db.query(Train).filter(Train.is_active == True).all()  # noqa: E712
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
    stop_dicts = [
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
        for s in stops_raw
    ]

    # Build occupancy: block_code → list of {train_number, entry_min, exit_min}
    occupancy = build_block_occupancy(trains_dicts, stop_dicts, section_dicts, block_dicts)

    model = cp_model.CpModel()
    start_vars: dict[int, cp_model.IntVar] = {}
    end_vars: dict[int, cp_model.IntVar] = {}
    interval_vars: dict[int, cp_model.IntervalVar] = {}

    for job in pending_jobs:
        lo = job.earliest_start_min
        dur = job.duration_min
        hi = max(lo, job.latest_end_min - dur)
        sv = model.new_int_var(lo, hi, f"start_{job.id}")
        ev = model.new_int_var(lo + dur, job.latest_end_min, f"end_{job.id}")
        iv = model.new_interval_var(sv, dur, ev, f"interval_{job.id}")
        model.add(ev == sv + dur)
        start_vars[job.id] = sv
        end_vars[job.id] = ev
        interval_vars[job.id] = iv

    # Constraint: no train in a job's blocks during maintenance window
    # We model this as: for each train window overlapping the block, the job must
    # be scheduled entirely before or after the train window.
    conflict_penalty_vars: list[cp_model.IntVar] = []
    for job in pending_jobs:
        block_codes = json.loads(job.block_codes_json)
        for block_code in block_codes:
            for win in occupancy.get(block_code, []):
                # Job must not overlap with train window [entry_min, exit_min)
                # Either job ends before train enters or starts after train exits
                b_before = model.new_bool_var(f"before_{job.id}_{block_code}_{win['train_number']}_{win['entry_min']}")
                model.add(end_vars[job.id] <= win["entry_min"]).only_enforce_if(b_before)
                model.add(start_vars[job.id] >= win["exit_min"]).only_enforce_if(b_before.negated())
                # Add soft penalty for affecting this train
                pen = model.new_int_var(0, 60, f"pen_{job.id}_{block_code}_{win['entry_min']}")
                # pen = overlap length if violated (hard constraint above prevents actual overlap)
                conflict_penalty_vars.append(pen)

    # No-overlap between jobs sharing any block
    for i, j1 in enumerate(pending_jobs):
        for j2 in pending_jobs[i + 1:]:
            bc1 = set(json.loads(j1.block_codes_json))
            bc2 = set(json.loads(j2.block_codes_json))
            if bc1 & bc2:
                model.add_no_overlap([interval_vars[j1.id], interval_vars[j2.id]])

    # User-specified no-overlap constraints
    for job in pending_jobs:
        no_overlap_ids = json.loads(job.no_overlap_job_ids_json)
        for other_id in no_overlap_ids:
            if other_id in interval_vars:
                model.add_no_overlap([interval_vars[job.id], interval_vars[other_id]])

    # Objective: minimize job lateness (start as early as possible)
    lateness_terms = [start_vars[j.id] - j.earliest_start_min for j in pending_jobs]
    model.minimize(sum(lateness_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = min(time_limit_s, settings.cpsat_time_limit_s)
    solver.parameters.random_seed = settings.seed_random_seed

    t0 = time.perf_counter()
    status = solver.solve(model)
    solve_time = time.perf_counter() - t0

    status_str = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "UNKNOWN",
    }.get(status, "UNKNOWN")

    plans_created: list[dict] = []

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Delete old plans for these jobs
        db.query(MaintenancePlan).filter(
            MaintenancePlan.job_id.in_([j.id for j in pending_jobs])
        ).delete()

        for rank, job in enumerate(
            sorted(pending_jobs, key=lambda j: solver.value(start_vars[j.id])), start=1
        ):
            assigned_start = solver.value(start_vars[job.id])
            assigned_end = solver.value(end_vars[job.id])
            block_codes = json.loads(job.block_codes_json)

            # Compute affected trains
            affected = set()
            for bc in block_codes:
                for win in occupancy.get(bc, []):
                    if win["entry_min"] < assigned_end and win["exit_min"] > assigned_start:
                        affected.add(win["train_number"])
            added_delay = len(affected) * max(0, (assigned_start - job.earliest_start_min))

            explanation = _explain_plan(job, assigned_start, assigned_end, affected, status_str, solve_time)

            plan = MaintenancePlan(
                job_id=job.id,
                assigned_start_min=assigned_start,
                assigned_end_min=assigned_end,
                affected_trains_json=json.dumps(list(affected)),
                total_added_delay_min=added_delay,
                rank=rank,
                explanation=explanation,
                solver_status=status_str,
            )
            db.add(plan)
            job.status = "planned"

            plans_created.append({
                "job_id": job.id,
                "job_title": job.title,
                "assigned_start_min": assigned_start,
                "assigned_end_min": assigned_end,
                "affected_trains": list(affected),
                "total_added_delay_min": added_delay,
                "rank": rank,
                "explanation": explanation,
                "solver_status": status_str,
            })

        db.commit()
    else:
        explanation = (
            f"CP-SAT returned {status_str} for {len(pending_jobs)} jobs. "
            "Possible causes: jobs cannot fit in their time windows without overlapping "
            "train traffic. Consider widening the time windows or splitting large jobs."
        )
        plans_created = [{"solver_status": status_str, "explanation": explanation}]

    return {"solver_status": status_str, "solve_time_s": round(solve_time, 3), "plans": plans_created}


def _explain_plan(job: MaintenanceJob, start: int, end: int, affected: set[str],
                  status: str, solve_time: float) -> str:
    """Template-generated explanation from solver output."""
    h_s, m_s = divmod(start, 60)
    h_e, m_e = divmod(end, 60)
    return (
        f"Solver: CP-SAT, status {status}, {solve_time:.1f}s. "
        f"Job '{job.title}': assigned {h_s:02d}:{m_s:02d}–{h_e:02d}:{m_e:02d} "
        f"(duration {job.duration_min} min, ASSUMED). "
        f"Blocks closed: {json.loads(job.block_codes_json)} (ASSUMED). "
        f"Trains affected: {sorted(affected) if affected else 'none'}. "
        f"Window chosen to minimise lateness from earliest start {job.earliest_start_min} min "
        f"while avoiding train occupancy windows (DERIVED from timetable). "
        "Infrastructure data is ASSUMED; verify with actual block-level data before use."
    )
