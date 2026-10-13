"""End-to-End Tests for Stringline Diagram and Conflict Radar.

Tests cover:
- Test 1: Visible train trajectories and schedule stops data integrity.
- Test 2: Opposing trains on single-track section with overlapping occupancy.
- Test 3: Safe separation on compatible tracks (no false positive conflicts).
- Test 4: Same-direction headway violation detection below configured minimum headway.
- Test 5: Schedule change invalidation and update.
- Test 6: Resilience against missing timestamps, unknown blocks, and empty schedules.
- Test 7: API contract verification for /api/trains and /api/conflicts.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.domain.conflict_rules import (
    ConflictType,
    Severity,
    build_block_occupancy,
    detect_all,
    detect_headway_violations,
    detect_opposing_movements,
    detect_reservation_overlaps,
)
from app.main import app


# ---------------------------------------------------------------------------
# Test Fixtures (Pure synthetic isolated test data)
# ---------------------------------------------------------------------------

@pytest.fixture
def synthetic_infra():
    """Isolated single-track and double-track section fixtures."""
    sections = [
        {
            "from_station_code": "MS",
            "to_station_code": "TBM",
            "running_time_min": 20,
            "distance_km": 25.0,
            "is_double_track": True,
            "headway_min": 5,
        },
        {
            "from_station_code": "TBM",
            "to_station_code": "CGL",
            "running_time_min": 60,
            "distance_km": 31.0,
            "is_double_track": False,  # Single track section
            "headway_min": 8,
        },
    ]
    blocks = [
        {
            "code": "BLK-MS-TBM-0",
            "section_from": "MS",
            "section_to": "TBM",
            "block_index": 0,
            "time_fraction": 0.5,
        },
        {
            "code": "BLK-MS-TBM-1",
            "section_from": "MS",
            "section_to": "TBM",
            "block_index": 1,
            "time_fraction": 0.5,
        },
        {
            "code": "BLK-TBM-CGL-0",
            "section_from": "TBM",
            "section_to": "CGL",
            "block_index": 0,
            "time_fraction": 0.5,
        },
        {
            "code": "BLK-TBM-CGL-1",
            "section_from": "TBM",
            "section_to": "CGL",
            "block_index": 1,
            "time_fraction": 0.5,
        },
    ]
    return sections, blocks


# ---------------------------------------------------------------------------
# Test 1: Visible Trajectories Data Integrity
# ---------------------------------------------------------------------------

def test_1_visible_trajectories_stops_data(synthetic_infra):
    """Verify that schedule stops provide continuous trajectory points."""
    sections, blocks = synthetic_infra
    trains = [
        {"train_number": "TR-DN1", "direction": "down", "priority": 1},
        {"train_number": "TR-UP1", "direction": "up", "priority": 1},
    ]
    stop_times = [
        # Down train: MS -> TBM -> CGL
        {"train_number": "TR-DN1", "station_code": "MS", "stop_sequence": 0, "planned_departure_min": 360},
        {"train_number": "TR-DN1", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 380, "planned_departure_min": 382},
        {"train_number": "TR-DN1", "station_code": "CGL", "stop_sequence": 2, "planned_arrival_min": 442},
        # Up train: CGL -> TBM -> MS
        {"train_number": "TR-UP1", "station_code": "CGL", "stop_sequence": 0, "planned_departure_min": 480},
        {"train_number": "TR-UP1", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 540, "planned_departure_min": 542},
        {"train_number": "TR-UP1", "station_code": "MS", "stop_sequence": 2, "planned_arrival_min": 562},
    ]

    occ = build_block_occupancy(trains, stop_times, sections, blocks)
    assert len(occ) > 0, "Block occupancy must not be empty"

    # Verify Down train occupied BLK-MS-TBM-0 and BLK-TBM-CGL-0
    assert any(w["train_number"] == "TR-DN1" for w in occ.get("BLK-MS-TBM-0", []))
    assert any(w["train_number"] == "TR-DN1" for w in occ.get("BLK-TBM-CGL-0", []))

    # Verify Up train reverse traversal populated blocks in reverse
    assert any(w["train_number"] == "TR-UP1" for w in occ.get("BLK-TBM-CGL-1", []))
    assert any(w["train_number"] == "TR-UP1" for w in occ.get("BLK-TBM-CGL-0", []))


# ---------------------------------------------------------------------------
# Test 2: Opposing Trains on Single Track Occupancy Conflict
# ---------------------------------------------------------------------------

def test_2_opposing_trains_single_track_conflict(synthetic_infra):
    """Two opposing trains attempting to occupy single-track block TBM-CGL simultaneously."""
    sections, blocks = synthetic_infra
    trains = [
        {"train_number": "EXP-DN", "direction": "down", "priority": 1},
        {"train_number": "EXP-UP", "direction": "up", "priority": 1},
    ]
    # EXP-DN enters TBM-CGL at 400 min; EXP-UP enters CGL-TBM at 410 min (overlap!)
    stop_times = [
        {"train_number": "EXP-DN", "station_code": "TBM", "stop_sequence": 0, "planned_departure_min": 400},
        {"train_number": "EXP-DN", "station_code": "CGL", "stop_sequence": 1, "planned_arrival_min": 460},
        {"train_number": "EXP-UP", "station_code": "CGL", "stop_sequence": 0, "planned_departure_min": 410},
        {"train_number": "EXP-UP", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 470},
    ]

    occ = build_block_occupancy(trains, stop_times, sections, blocks)
    opposing_conflicts = detect_opposing_movements(occ, sections, blocks=blocks)

    assert len(opposing_conflicts) > 0, "Opposing conflict must be detected on single-track block"
    c = opposing_conflicts[0]
    assert c.conflict_type == ConflictType.OPPOSING_MOVEMENT
    assert c.severity == Severity.CRITICAL
    assert "EXP-DN" in c.trains and "EXP-UP" in c.trains
    assert "TBM-CGL" in c.resource_code
    assert c.interval_start_min <= c.interval_end_min
    assert len(c.suggested_actions) > 0


# ---------------------------------------------------------------------------
# Test 3: Safe Separation (No Conflict)
# ---------------------------------------------------------------------------

def test_3_safe_separation_no_conflict(synthetic_infra):
    """Trains running with safe headway on single-track and double-track lines."""
    sections, blocks = synthetic_infra
    trains = [
        {"train_number": "TR-SAFE-1", "direction": "down", "priority": 1},
        {"train_number": "TR-SAFE-2", "direction": "down", "priority": 1},
    ]
    # TR-SAFE-1 departs 360, TR-SAFE-2 departs 480 (safe gap = 120 min, well above 8 min headway)
    stop_times = [
        {"train_number": "TR-SAFE-1", "station_code": "TBM", "stop_sequence": 0, "planned_departure_min": 360},
        {"train_number": "TR-SAFE-1", "station_code": "CGL", "stop_sequence": 1, "planned_arrival_min": 420},
        {"train_number": "TR-SAFE-2", "station_code": "TBM", "stop_sequence": 0, "planned_departure_min": 480},
        {"train_number": "TR-SAFE-2", "station_code": "CGL", "stop_sequence": 1, "planned_arrival_min": 540},
    ]

    results = detect_all(trains, stop_times, sections, blocks)
    assert len(results) == 0, "Safe schedule with 120-min separation must produce zero conflicts"


# ---------------------------------------------------------------------------
# Test 4: Same-Direction Headway Violation
# ---------------------------------------------------------------------------

def test_4_same_direction_headway_violation(synthetic_infra):
    """Following train departs within headway_min (e.g. 3 min apart when headway is 5 min)."""
    sections, blocks = synthetic_infra
    trains = [
        {"train_number": "TR-LEAD", "direction": "down", "priority": 1},
        {"train_number": "TR-TRAIL", "direction": "down", "priority": 1},
    ]
    # Departs only 3 minutes apart on MS-TBM (headway_min = 5)
    stop_times = [
        {"train_number": "TR-LEAD", "station_code": "MS", "stop_sequence": 0, "planned_departure_min": 360},
        {"train_number": "TR-LEAD", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 380},
        {"train_number": "TR-TRAIL", "station_code": "MS", "stop_sequence": 0, "planned_departure_min": 363},
        {"train_number": "TR-TRAIL", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 383},
    ]

    occ = build_block_occupancy(trains, stop_times, sections, blocks)
    headway_conflicts = detect_headway_violations(occ, sections, blocks=blocks)

    assert len(headway_conflicts) > 0, "Headway violation must be detected when gap < headway_min"
    c = headway_conflicts[0]
    assert c.conflict_type == ConflictType.HEADWAY_VIOLATION
    assert c.severity == Severity.HIGH
    assert "TR-LEAD" in c.trains and "TR-TRAIL" in c.trains


# ---------------------------------------------------------------------------
# Test 5: Dynamic Data Changes and Scenario Invalidation
# ---------------------------------------------------------------------------

def test_5_data_changes_and_recalculation(synthetic_infra):
    """Verify that retiming an offending train eliminates the conflict dynamically."""
    sections, blocks = synthetic_infra
    trains = [
        {"train_number": "T1", "direction": "down", "priority": 1},
        {"train_number": "T2", "direction": "up", "priority": 1},
    ]
    # Conflicting schedule initially
    conflicted_stops = [
        {"train_number": "T1", "station_code": "TBM", "stop_sequence": 0, "planned_departure_min": 400},
        {"train_number": "T1", "station_code": "CGL", "stop_sequence": 1, "planned_arrival_min": 460},
        {"train_number": "T2", "station_code": "CGL", "stop_sequence": 0, "planned_departure_min": 410},
        {"train_number": "T2", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 470},
    ]
    assert len(detect_all(trains, conflicted_stops, sections, blocks)) > 0

    # Retimed schedule (T2 delayed to 470 to clear T1)
    retimed_stops = [
        {"train_number": "T1", "station_code": "TBM", "stop_sequence": 0, "planned_departure_min": 400},
        {"train_number": "T1", "station_code": "CGL", "stop_sequence": 1, "planned_arrival_min": 460},
        {"train_number": "T2", "station_code": "CGL", "stop_sequence": 0, "planned_departure_min": 470},
        {"train_number": "T2", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": 530},
    ]
    new_results = detect_all(trains, retimed_stops, sections, blocks)
    assert len(new_results) == 0, "After retiming, obsolete conflicts must be cleared"


# ---------------------------------------------------------------------------
# Test 6: Missing, Incomplete, or Invalid Data Robustness
# ---------------------------------------------------------------------------

def test_6_invalid_and_empty_data_resilience(synthetic_infra):
    """Verify that missing stops, invalid sequences, or None times never crash."""
    sections, blocks = synthetic_infra

    # 1. Empty schedule
    assert detect_all([], [], sections, blocks) == []

    # 2. Train with only 1 stop
    single_stop_train = [{"train_number": "SOLO", "direction": "up", "priority": 1}]
    single_stop = [{"train_number": "SOLO", "station_code": "MS", "stop_sequence": 0, "planned_departure_min": 360}]
    assert detect_all(single_stop_train, single_stop, sections, blocks) == []

    # 3. None departure time
    none_time_train = [{"train_number": "NONE", "direction": "down", "priority": 1}]
    none_time_stop = [
        {"train_number": "NONE", "station_code": "MS", "stop_sequence": 0, "planned_departure_min": None},
        {"train_number": "NONE", "station_code": "TBM", "stop_sequence": 1, "planned_arrival_min": None},
    ]
    assert detect_all(none_time_train, none_time_stop, sections, blocks) == []


# ---------------------------------------------------------------------------
# Test 7: API Contract Endpoints Test
# ---------------------------------------------------------------------------

def test_7_api_contract_trains_and_conflicts():
    """Verify live API endpoints return expected properties."""
    client = TestClient(app)

    # 1. GET /api/trains must return stops array with planned and station details
    res_trains = client.get("/api/trains")
    assert res_trains.status_code == 200
    trains_data = res_trains.json()
    assert isinstance(trains_data, list)
    if len(trains_data) > 0:
        first_train = trains_data[0]
        assert "stops" in first_train, "Train object must include stops array for trajectory diagram"
        assert isinstance(first_train["stops"], list)
        if len(first_train["stops"]) > 0:
            first_stop = first_train["stops"][0]
            assert "station_code" in first_stop
            assert "planned_departure_min" in first_stop

    # 2. GET /api/conflicts/list and POST /api/conflicts/detect contract
    res_detect = client.post("/api/conflicts/detect")
    assert res_detect.status_code == 200
    detect_data = res_detect.json()
    assert "conflicts" in detect_data
    assert "count" in detect_data

    res_list = client.get("/api/conflicts/list")
    assert res_list.status_code == 200
    list_data = res_list.json()
    assert "conflicts" in list_data
    assert "count" in list_data
