"""Domain tests for Clearway AI: graph, synthetic network, conflicts, and simulation."""

from __future__ import annotations

import pytest

from app.domain.synthetic_network import build_synthetic_network
from app.domain.graph import build_graph
from app.domain.simulator import Simulator


def test_build_synthetic_network():
    net = build_synthetic_network(blocks_per_section=2)
    assert len(net.stations) >= 6
    assert len(net.sections) >= 5
    assert len(net.blocks) >= 10
    assert len(net.trains) >= 4

    # Verify every train has valid stop sequence
    for tr in net.trains:
        assert len(tr.stops) >= 2
        for s in tr.stops:
            assert s["station_code"] in [st.code for st in net.stations]


def test_network_graph():
    net = build_synthetic_network(blocks_per_section=2)
    st_dicts = [{"code": s.code, "name": s.name, "lat": s.lat, "lon": s.lon} for s in net.stations]
    sec_dicts = [
        {"from_station_code": s.from_code, "to_station_code": s.to_code, "running_time_min": s.running_time_min}
        for s in net.sections
    ]
    blk_dicts = [
        {"code": b.code, "section_from": b.section_from, "section_to": b.section_to, "block_index": b.block_index, "time_fraction": b.time_fraction}
        for b in net.blocks
    ]
    ng = build_graph(st_dicts, sec_dicts, blk_dicts)
    assert len(ng.station_codes()) == len(net.stations)
    assert len(ng.section_edges()) == len(net.sections)


def test_simulator_step_and_train_movement():
    net = build_synthetic_network(blocks_per_section=2)
    st_dicts = [{"code": s.code, "name": s.name, "lat": s.lat, "lon": s.lon} for s in net.stations]
    sec_dicts = [
        {"from_station_code": s.from_code, "to_station_code": s.to_code, "running_time_min": s.running_time_min}
        for s in net.sections
    ]
    blk_dicts = [
        {
            "code": b.code,
            "section_from": b.section_from,
            "section_to": b.section_to,
            "block_index": b.block_index,
            "time_fraction": b.time_fraction,
            "section_running_time_min": 30,
        }
        for b in net.blocks
    ]
    tr_dicts = [{"train_number": t.number, "name": t.name, "direction": t.direction, "priority": t.priority} for t in net.trains]
    stop_times = []
    for tr in net.trains:
        for seq, st in enumerate(tr.stops):
            stop_times.append({
                "train_number": tr.number,
                "station_code": st["station_code"],
                "stop_sequence": seq,
                "planned_arrival_min": st.get("arrival_min"),
                "planned_departure_min": st.get("departure_min"),
                "dwell_min": st.get("dwell_min", 2),
            })

    sim = Simulator(st_dicts, sec_dicts, blk_dicts, tr_dicts, stop_times)
    sim.reset(start_time_min=300)
    
    initial_summary = sim.get_state_dict()
    assert initial_summary["current_time_min"] == 300
    assert "trains" in initial_summary
    assert "blocks" in initial_summary
    
    # Step forward 30 minutes
    for _ in range(30):
        sim.step()
    state = sim.get_state_dict()
    assert state["current_time_min"] == 330
    assert state["step_count"] == 30
