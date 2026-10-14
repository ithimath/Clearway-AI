"""Differential and regression test suite for CP-SAT optimization and verifier.

Requirements covered:
- Condition 6: Differential tests (solver vs. brute force on small cases)
- Condition 6: Regression scenarios for each conflict type:
  1. Block reservation overlap
  2. Headway violation
  3. Opposing movement conflict
  4. Maintenance closure
  5. Station capacity constraint
- Condition 8: Never relax a hard constraint to make a schedule feasible
"""

from __future__ import annotations

import itertools
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models.infrastructure import Block, Station, TrackSection
from app.models.maintenance import MaintenanceJob, MaintenancePlan
from app.models.trains import StopTime, Train
from app.domain.verifier import (
    verify_schedule_integrity,
    verify_block_reservation_overlaps,
    verify_headway_separation,
    verify_opposing_movements,
    verify_maintenance_closures,
    verify_station_capacity,
)
from app.optimization.cpsat_schedule import optimize_schedule


@pytest.fixture
def mem_db():
    """In-memory isolated SQLite database fixture."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    SessionMem = sessionmaker(bind=engine)
    session = SessionMem()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# Differential Tests: CP-SAT vs. Exhaustive Brute-Force
# ---------------------------------------------------------------------------

def test_differential_cpsat_vs_brute_force_single_track(mem_db: Session):
    """Differential test: CP-SAT vs. Exhaustive Brute Force on small 2-train opposing instance."""
    # Build minimal single-track corridor: Station S1 <-> Station S2 (single track, 20 min)
    s1 = Station(code="STN1", name="Station 1", lat=10.0, lon=78.0, platform_count=2, has_passing_loop=True)
    s2 = Station(code="STN2", name="Station 2", lat=10.5, lon=78.5, platform_count=2, has_passing_loop=True)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(
        from_station_id=s1.id,
        to_station_id=s2.id,
        running_time_min=20,
        distance_km=25.0,
        is_double_track=False,
        headway_min=5,
    )
    mem_db.add(sec)
    mem_db.flush()

    blk1 = Block(code="BLK-S1-S2-0", section_id=sec.id, block_index=0, time_fraction=0.5, state="available")
    blk2 = Block(code="BLK-S1-S2-1", section_id=sec.id, block_index=1, time_fraction=0.5, state="available")
    mem_db.add_all([blk1, blk2])
    mem_db.flush()

    # Train 1: STN1 -> STN2, departing at min 100, Priority 1
    # Train 2: STN2 -> STN1, departing at min 105, Priority 2 (overlaps with Train 1 on single track!)
    t1 = Train(train_number="TR1_DN", name="Train 1", train_type="express", direction="down", priority=1, is_active=True)
    t2 = Train(train_number="TR2_UP", name="Train 2", train_type="freight", direction="up", priority=2, is_active=True)
    mem_db.add_all([t1, t2])
    mem_db.flush()

    st1_0 = StopTime(train_id=t1.id, station_id=s1.id, stop_sequence=0, planned_departure_min=100, dwell_min=2)
    st1_1 = StopTime(train_id=t1.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=120, dwell_min=2)
    st2_0 = StopTime(train_id=t2.id, station_id=s2.id, stop_sequence=0, planned_departure_min=105, dwell_min=2)
    st2_1 = StopTime(train_id=t2.id, station_id=s1.id, stop_sequence=1, planned_arrival_min=125, dwell_min=2)
    mem_db.add_all([st1_0, st1_1, st2_0, st2_1])
    mem_db.commit()

    # Domain dicts for independent verifier
    trains_dicts = [
        {"train_number": "TR1_DN", "direction": "down", "priority": 1},
        {"train_number": "TR2_UP", "direction": "up", "priority": 2},
    ]
    sections_dicts = [{
        "from_station_code": "STN1",
        "to_station_code": "STN2",
        "running_time_min": 20,
        "is_double_track": False,
        "headway_min": 5,
    }]
    blocks_dicts = [
        {"code": "BLK-S1-S2-0", "section_from": "STN1", "section_to": "STN2", "block_index": 0, "time_fraction": 0.5},
        {"code": "BLK-S1-S2-1", "section_from": "STN1", "section_to": "STN2", "block_index": 1, "time_fraction": 0.5},
    ]
    stations_dicts = [
        {"code": "STN1", "name": "Station 1", "platform_count": 2, "has_passing_loop": True},
        {"code": "STN2", "name": "Station 2", "platform_count": 2, "has_passing_loop": True},
    ]

    # --- 1. Exhaustive Brute-Force Search ---
    # Search all discrete integer delays d1 in [0, 40], d2 in [0, 40]
    best_bf_objective = float("inf")
    best_bf_delays = (None, None)

    delay_w = 1.0
    change_w = 0.5

    for d1, d2 in itertools.product(range(41), range(41)):
        candidate_stops = [
            {"train_number": "TR1_DN", "station_code": "STN1", "stop_sequence": 0,
             "planned_departure_min": 100, "revised_departure_min": 100 + d1},
            {"train_number": "TR1_DN", "station_code": "STN2", "stop_sequence": 1,
             "planned_arrival_min": 120, "revised_arrival_min": 120 + d1},
            {"train_number": "TR2_UP", "station_code": "STN2", "stop_sequence": 0,
             "planned_departure_min": 105, "revised_departure_min": 105 + d2},
            {"train_number": "TR2_UP", "station_code": "STN1", "stop_sequence": 1,
             "planned_arrival_min": 125, "revised_arrival_min": 125 + d2},
        ]
        res = verify_schedule_integrity(trains_dicts, candidate_stops, sections_dicts, blocks_dicts, stations_dicts)
        if res.is_valid:
            # Objective: priority-weighted arrival delay + timetable change penalty
            obj = (int(change_w * 10) * d1 + int(delay_w * 1 * 10) * d1 +
                   int(change_w * 10) * d2 + int(delay_w * 2 * 10) * d2)
            if obj < best_bf_objective:
                best_bf_objective = obj
                best_bf_delays = (d1, d2)

    assert best_bf_delays[0] is not None, "Brute force must find at least one valid schedule"

    # --- 2. Solve with CP-SAT ---
    weights = {"delay_weight": 1.0, "timetable_change_penalty": 0.5, "max_delay_min": 60, "time_limit_s": 5.0}
    cpsat_res = optimize_schedule(mem_db, weights)

    assert cpsat_res["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert cpsat_res["verified"] is True
    assert cpsat_res["conflicts_after"] == 0

    # CP-SAT objective must match or beat brute-force
    cpsat_obj = cpsat_res["objective_value"]
    assert cpsat_obj <= best_bf_objective, f"CP-SAT objective {cpsat_obj} should match brute-force {best_bf_objective}"


# ---------------------------------------------------------------------------
# Regression Scenarios for Each Conflict Type
# ---------------------------------------------------------------------------

def test_regression_scenario_1_reservation_overlap(mem_db: Session):
    """Conflict Type 1: Two trains trying to occupy the same exclusive single-track block."""
    s1 = Station(code="A", name="A", lat=1.0, lon=1.0, platform_count=2)
    s2 = Station(code="B", name="B", lat=2.0, lon=2.0, platform_count=2)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(from_station_id=s1.id, to_station_id=s2.id, running_time_min=30, is_double_track=False)
    mem_db.add(sec)
    mem_db.flush()

    blk = Block(code="BLK-A-B-0", section_id=sec.id, block_index=0, time_fraction=1.0, state="available")
    mem_db.add(blk)
    mem_db.flush()

    # Two same-direction trains departing at the same minute 200
    t1 = Train(train_number="T1", name="Train 1", direction="down", priority=1, is_active=True)
    t2 = Train(train_number="T2", name="Train 2", direction="down", priority=2, is_active=True)
    mem_db.add_all([t1, t2])
    mem_db.flush()

    mem_db.add_all([
        StopTime(train_id=t1.id, station_id=s1.id, stop_sequence=0, planned_departure_min=200),
        StopTime(train_id=t1.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=230),
        StopTime(train_id=t2.id, station_id=s1.id, stop_sequence=0, planned_departure_min=200),
        StopTime(train_id=t2.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=230),
    ])
    mem_db.commit()

    res = optimize_schedule(mem_db, {"time_limit_s": 5.0})
    assert res["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert res["verified"] is True
    assert res["conflicts_after"] == 0


def test_regression_scenario_2_headway_violation(mem_db: Session):
    """Conflict Type 2: Consecutive trains closer than minimum headway (5 min)."""
    s1 = Station(code="A", name="A", lat=1.0, lon=1.0, platform_count=2)
    s2 = Station(code="B", name="B", lat=2.0, lon=2.0, platform_count=2)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(from_station_id=s1.id, to_station_id=s2.id, running_time_min=20, is_double_track=True, headway_min=6)
    mem_db.add(sec)
    mem_db.flush()

    blk = Block(code="BLK-A-B-0", section_id=sec.id, block_index=0, time_fraction=1.0, state="available")
    mem_db.add(blk)
    mem_db.flush()

    # T1 departs at 300, T2 departs at 302 (gap = 2 min < headway 6 min)
    t1 = Train(train_number="T1", name="Train 1", direction="down", priority=1, is_active=True)
    t2 = Train(train_number="T2", name="Train 2", direction="down", priority=1, is_active=True)
    mem_db.add_all([t1, t2])
    mem_db.flush()

    mem_db.add_all([
        StopTime(train_id=t1.id, station_id=s1.id, stop_sequence=0, planned_departure_min=300),
        StopTime(train_id=t1.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=320),
        StopTime(train_id=t2.id, station_id=s1.id, stop_sequence=0, planned_departure_min=302),
        StopTime(train_id=t2.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=322),
    ])
    mem_db.commit()

    res = optimize_schedule(mem_db, {"time_limit_s": 5.0})
    assert res["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert res["verified"] is True
    assert res["conflicts_after"] == 0

    # Verify spacing >= 6 min
    revised = {item["train_number"]: item["revised_departure_min"] for item in res["revised_schedule"] if item["station_code"] == "A"}
    assert abs(revised["T2"] - revised["T1"]) >= 6


def test_regression_scenario_3_opposing_movement(mem_db: Session):
    """Conflict Type 3: Opposing trains on single track with multiple blocks."""
    s1 = Station(code="A", name="A", lat=1.0, lon=1.0, platform_count=2, has_passing_loop=True)
    s2 = Station(code="B", name="B", lat=2.0, lon=2.0, platform_count=2, has_passing_loop=True)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(from_station_id=s1.id, to_station_id=s2.id, running_time_min=40, is_double_track=False)
    mem_db.add(sec)
    mem_db.flush()

    blk0 = Block(code="BLK-A-B-0", section_id=sec.id, block_index=0, time_fraction=0.5, state="available")
    blk1 = Block(code="BLK-A-B-1", section_id=sec.id, block_index=1, time_fraction=0.5, state="available")
    mem_db.add_all([blk0, blk1])
    mem_db.flush()

    t_dn = Train(train_number="T_DN", name="Train DN", direction="down", priority=1, is_active=True)
    t_up = Train(train_number="T_UP", name="Train UP", direction="up", priority=2, is_active=True)
    mem_db.add_all([t_dn, t_up])
    mem_db.flush()

    mem_db.add_all([
        StopTime(train_id=t_dn.id, station_id=s1.id, stop_sequence=0, planned_departure_min=400),
        StopTime(train_id=t_dn.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=440),
        StopTime(train_id=t_up.id, station_id=s2.id, stop_sequence=0, planned_departure_min=410),
        StopTime(train_id=t_up.id, station_id=s1.id, stop_sequence=1, planned_arrival_min=450),
    ])
    mem_db.commit()

    res = optimize_schedule(mem_db, {"time_limit_s": 5.0})
    assert res["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert res["verified"] is True
    assert res["conflicts_after"] == 0


def test_regression_scenario_4_maintenance_closure(mem_db: Session):
    """Conflict Type 4: Train scheduled into block with active maintenance closure."""
    s1 = Station(code="A", name="A", lat=1.0, lon=1.0, platform_count=2)
    s2 = Station(code="B", name="B", lat=2.0, lon=2.0, platform_count=2)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(from_station_id=s1.id, to_station_id=s2.id, running_time_min=30, is_double_track=False)
    mem_db.add(sec)
    mem_db.flush()

    blk = Block(code="BLK-A-B-0", section_id=sec.id, block_index=0, time_fraction=1.0, state="available")
    mem_db.add(blk)
    mem_db.flush()

    t = Train(train_number="T_MAINT", name="Train Maint", direction="down", priority=1, is_active=True)
    mem_db.add(t)
    mem_db.flush()

    # Train originally planned to depart at 500 (traversing 500-530)
    mem_db.add_all([
        StopTime(train_id=t.id, station_id=s1.id, stop_sequence=0, planned_departure_min=500),
        StopTime(train_id=t.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=530),
    ])
    mem_db.commit()

    # Maintenance window on BLK-A-B-0 from 480 to 520
    weights = {
        "maintenance_windows": [{"block_code": "BLK-A-B-0", "start_min": 480, "end_min": 520}],
        "time_limit_s": 5.0,
    }
    res = optimize_schedule(mem_db, weights)
    assert res["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert res["verified"] is True
    assert res["conflicts_after"] == 0

    # Train must be delayed to enter after 520
    revised_dep = next(item["revised_departure_min"] for item in res["revised_schedule"] if item["station_code"] == "A")
    assert revised_dep >= 520


def test_regression_scenario_5_station_capacity(mem_db: Session):
    """Conflict Type 5: 3 trains dwelling simultaneously at a station with platform capacity = 2."""
    s1 = Station(code="HUB", name="Hub Station", lat=1.0, lon=1.0, platform_count=2, has_passing_loop=False)
    s2 = Station(code="OUT", name="Outer Station", lat=2.0, lon=2.0, platform_count=2)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(from_station_id=s1.id, to_station_id=s2.id, running_time_min=30, is_double_track=True)
    mem_db.add(sec)
    mem_db.flush()

    blk = Block(code="BLK-HUB-OUT-0", section_id=sec.id, block_index=0, time_fraction=1.0, state="available")
    mem_db.add(blk)
    mem_db.flush()

    t1 = Train(train_number="T1", name="Train 1", direction="down", priority=1, is_active=True)
    t2 = Train(train_number="T2", name="Train 2", direction="down", priority=1, is_active=True)
    t3 = Train(train_number="T3", name="Train 3", direction="down", priority=1, is_active=True)
    mem_db.add_all([t1, t2, t3])
    mem_db.flush()

    # All three planned to depart at min 600
    for tr in (t1, t2, t3):
        mem_db.add_all([
            StopTime(train_id=tr.id, station_id=s1.id, stop_sequence=0, planned_departure_min=600, dwell_min=5),
            StopTime(train_id=tr.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=630, dwell_min=2),
        ])
    mem_db.commit()

    res = optimize_schedule(mem_db, {"time_limit_s": 5.0})
    assert res["solver_status"] in ("OPTIMAL", "FEASIBLE")
    assert res["verified"] is True
    assert res["conflicts_after"] == 0


def test_regression_scenario_6_never_relax_hard_constraint(mem_db: Session):
    """Condition 8: Never relax a hard constraint to make a schedule feasible.

    When a block is closed all day and max_delay_min is 0 (or cannot bypass),
    solver MUST report INFEASIBLE rather than ignoring the closure.
    """
    s1 = Station(code="A", name="A", lat=1.0, lon=1.0, platform_count=1)
    s2 = Station(code="B", name="B", lat=2.0, lon=2.0, platform_count=1)
    mem_db.add_all([s1, s2])
    mem_db.flush()

    sec = TrackSection(from_station_id=s1.id, to_station_id=s2.id, running_time_min=30, is_double_track=False)
    mem_db.add(sec)
    mem_db.flush()

    # Block is closed full day
    blk = Block(code="BLK-CLOSED-ALL-DAY", section_id=sec.id, block_index=0, time_fraction=1.0, state="closed")
    mem_db.add(blk)
    mem_db.flush()

    t = Train(train_number="T_BLOCKED", name="Train Blocked", direction="down", priority=1, is_active=True)
    mem_db.add(t)
    mem_db.flush()

    mem_db.add_all([
        StopTime(train_id=t.id, station_id=s1.id, stop_sequence=0, planned_departure_min=100),
        StopTime(train_id=t.id, station_id=s2.id, stop_sequence=1, planned_arrival_min=130),
    ])
    mem_db.commit()

    # With closed block and single route, schedule MUST be INFEASIBLE
    res = optimize_schedule(mem_db, {"time_limit_s": 3.0})
    assert res["solver_status"] == "INFEASIBLE"
