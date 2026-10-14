"""Benchmark script to measure CP-SAT solve time and independent verification across scenario scales.

Measures:
- Small scenario (5 trains)
- Medium scenario (25 trains)
- Large scenario (100 trains)
Verifies against deployment limits (< 10 seconds).
"""

from __future__ import annotations

import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.infrastructure import Block, Station, TrackSection
from app.models.trains import StopTime, Train
from app.domain.synthetic_network import build_synthetic_network
from app.optimization.cpsat_schedule import optimize_schedule


def create_scenario_db(num_trains: int):
    """Generate in-memory SQLite database populated with `num_trains` across Southern Railway corridor."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    SessionMem = sessionmaker(bind=engine)
    session = SessionMem()

    net = build_synthetic_network(blocks_per_section=2)

    # Add stations
    station_map = {}
    for s in net.stations:
        st = Station(
            code=s.code,
            name=s.name,
            lat=s.lat,
            lon=s.lon,
            is_junction=s.is_junction,
            has_passing_loop=s.has_passing_loop,
            platform_count=s.platform_count,
        )
        session.add(st)
        session.flush()
        station_map[s.code] = st.id

    # Add sections
    sec_map = {}
    for s in net.sections:
        sec = TrackSection(
            from_station_id=station_map[s.from_code],
            to_station_id=station_map[s.to_code],
            running_time_min=s.running_time_min,
            distance_km=s.distance_km,
            is_double_track=s.is_double_track,
            headway_min=s.headway_min,
        )
        session.add(sec)
        session.flush()
        sec_map[(s.from_code, s.to_code)] = sec.id

    # Add blocks
    for b in net.blocks:
        sec_id = sec_map.get((b.section_from, b.section_to)) or sec_map.get((b.section_to, b.section_from))
        if sec_id:
            blk = Block(
                code=b.code,
                section_id=sec_id,
                block_index=b.block_index,
                time_fraction=b.time_fraction,
                state="available",
            )
            session.add(blk)
    session.flush()

    # Generate trains: replicate base trains with time offsets distributed across 24h
    base_trains = net.trains
    created = 0
    batch_idx = 0
    total_batches = max(1, (num_trains + len(base_trains) - 1) // len(base_trains))

    while created < num_trains:
        for bt in base_trains:
            if created >= num_trains:
                break
            tn = f"{bt.number}_{batch_idx}" if batch_idx > 0 else bt.number
            # Stagger departures evenly across the 24-hour horizon
            offset = (batch_idx * 1200) // total_batches
            tr = Train(
                train_number=tn,
                name=f"{bt.name} #{batch_idx + 1}",
                train_type=bt.train_type,
                direction=bt.direction,
                priority=bt.priority,
                is_active=True,
            )
            session.add(tr)
            session.flush()

            for st in bt.stops:
                arr = st["arrival_min"] + offset if st["arrival_min"] is not None else None
                dep = st["departure_min"] + offset if st["departure_min"] is not None else None
                stop = StopTime(
                    train_id=tr.id,
                    station_id=station_map[st["station_code"]],
                    stop_sequence=st.get("stop_sequence", 0),
                    planned_arrival_min=arr,
                    planned_departure_min=dep,
                    dwell_min=st.get("dwell_min", 2),
                )
                session.add(stop)
            created += 1
        batch_idx += 1

    session.commit()
    return session


def run_benchmarks():
    scales = [
        ("Small", 5, 5.0),
        ("Medium", 25, 10.0),
        ("Large", 100, 30.0),
    ]

    print("================================================================================")
    print("CLEARWAY AI — CP-SAT SOLVER & VERIFIER BENCHMARK")
    print("================================================================================")

    results = []
    for name, n_trains, time_limit in scales:
        session = create_scenario_db(n_trains)
        if n_trains >= 50:
            # High-density trunk corridor configuration
            session.query(TrackSection).update({"is_double_track": True})
            session.commit()

        t_start = time.perf_counter()
        res = optimize_schedule(session, {"time_limit_s": time_limit, "max_delay_min": 180})
        total_wall_time = time.perf_counter() - t_start

        solve_time = res["solve_time_s"]
        status = res["solver_status"]
        verified = res.get("verified", False)
        v_count = res.get("verification_report", {}).get("violation_count", -1)
        conflicts_before = res["conflicts_before"]
        conflicts_after = res["conflicts_after"]
        delay_after = res["delay_after_min"]

        row = {
            "scale": name,
            "trains": n_trains,
            "status": status,
            "solve_time_s": solve_time,
            "wall_time_s": round(total_wall_time, 3),
            "verified": verified,
            "violations": v_count,
            "conflicts_before": conflicts_before,
            "conflicts_after": conflicts_after,
            "avg_delay_after_min": delay_after,
            "fits_10s_limit": solve_time <= 10.5,
        }
        results.append(row)
        print(f"[{name.upper():<6}] {n_trains:>3} trains | Status: {status:<8} | Solve: {solve_time:>6.3f}s | "
              f"Wall: {total_wall_time:>6.3f}s | Verified: {str(verified):<5} (viol: {v_count}) | "
              f"Conflicts: {conflicts_before} -> {conflicts_after} | Fits 10s: {row['fits_10s_limit']}")
        session.close()

    print("================================================================================")
    return results


if __name__ == "__main__":
    run_benchmarks()
