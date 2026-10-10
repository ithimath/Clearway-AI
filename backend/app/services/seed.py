"""Database seeding service.

Loads the synthetic network into the database.
If real datasets are found in data/raw/, they are loaded instead (Phase 2).
Called once at startup or via CLI: python -m app.services.seed
"""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.synthetic_network import build_synthetic_network
from app.models.infrastructure import Block, Junction, PassingLoop, Station, TrackSection
from app.models.trains import StopTime, Train
from app.models.events import SystemEvent

logger = logging.getLogger(__name__)


def seed_database(db: Session, force: bool = False) -> None:
    """Seed infrastructure + timetable from synthetic generator.

    Args:
        db:    SQLAlchemy session.
        force: If True, drop and re-seed even if data already exists.
    """
    if not force and db.query(Station).count() > 0:
        logger.info("Database already seeded; skipping. Use force=True to re-seed.")
        return

    if force:
        _clear_infra(db)

    net = build_synthetic_network(blocks_per_section=settings.blocks_per_section)
    logger.info("Seeding %d stations…", len(net.stations))

    station_map: dict[str, int] = {}  # code → db id

    # --- Stations ---
    for s in net.stations:
        obj = Station(
            code=s.code,
            name=s.name,
            lat=s.lat,
            lon=s.lon,
            is_junction=s.is_junction,
            has_passing_loop=s.has_passing_loop,
            platform_count=s.platform_count,
            provenance=s.provenance,
        )
        db.add(obj)
        db.flush()
        station_map[s.code] = obj.id

    # --- Track sections ---
    logger.info("Seeding %d sections…", len(net.sections))
    section_map: dict[tuple[str, str], int] = {}  # (from, to) → db id

    for sec in net.sections:
        obj = TrackSection(
            from_station_id=station_map[sec.from_code],
            to_station_id=station_map[sec.to_code],
            running_time_min=sec.running_time_min,
            distance_km=sec.distance_km,
            is_double_track=sec.is_double_track,
            headway_min=sec.headway_min,
            provenance=sec.provenance,
        )
        db.add(obj)
        db.flush()
        section_map[(sec.from_code, sec.to_code)] = obj.id

    # --- Blocks ---
    logger.info("Seeding %d blocks…", len(net.blocks))
    for blk in net.blocks:
        key = (blk.section_from, blk.section_to)
        sec_id = section_map.get(key)
        if sec_id is None:
            logger.warning("Block %s has no matching section, skipping.", blk.code)
            continue
        obj = Block(
            code=blk.code,
            section_id=sec_id,
            block_index=blk.block_index,
            time_fraction=blk.time_fraction,
            state="available",
            provenance=blk.provenance,
        )
        db.add(obj)

    # --- Junctions ---
    logger.info("Seeding %d junctions…", len(net.junctions))
    for jn in net.junctions:
        sid = station_map.get(jn.at_station_code)
        obj = Junction(
            code=jn.code,
            name=jn.name,
            station_id=sid,
            section_ids_json=json.dumps(jn.section_codes),
            provenance=jn.provenance,
        )
        db.add(obj)

    # --- Passing loops ---
    logger.info("Seeding %d passing loops…", len(net.loops))
    for lp in net.loops:
        sid = station_map.get(lp.at_station_code)
        if sid is None:
            continue
        obj = PassingLoop(
            code=lp.code,
            station_id=sid,
            capacity_trains=lp.capacity_trains,
            provenance=lp.provenance,
        )
        db.add(obj)

    # --- Trains ---
    logger.info("Seeding %d trains…", len(net.trains))
    for tr in net.trains:
        train_obj = Train(
            train_number=tr.number,
            name=tr.name,
            train_type=tr.train_type,
            direction=tr.direction,
            priority=tr.priority,
            is_active=True,
            provenance=tr.provenance,
        )
        db.add(train_obj)
        db.flush()

        for seq, stop in enumerate(tr.stops):
            st_id = station_map.get(stop["station_code"])
            if st_id is None:
                continue
            st_obj = StopTime(
                train_id=train_obj.id,
                station_id=st_id,
                stop_sequence=seq,
                planned_arrival_min=stop.get("arrival_min"),
                planned_departure_min=stop.get("departure_min"),
                dwell_min=stop.get("dwell_min", 2),
                provenance=tr.provenance,
            )
            db.add(st_obj)

    # --- Seed event ---
    ev = SystemEvent(
        category="data",
        level="info",
        message=f"Database seeded with synthetic corridor '{settings.corridor_name}' "
                f"({len(net.stations)} stations, {len(net.trains)} trains). "
                "All infrastructure data is ASSUMED.",
    )
    db.add(ev)

    db.commit()
    logger.info("Seeding complete.")


def _clear_infra(db: Session) -> None:
    """Delete all infrastructure and timetable rows before re-seeding."""
    db.query(StopTime).delete()
    db.query(Train).delete()
    db.query(Block).delete()
    db.query(TrackSection).delete()
    db.query(Junction).delete()
    db.query(PassingLoop).delete()
    db.query(Station).delete()
    db.commit()


if __name__ == "__main__":
    # Allow running as: python -m app.services.seed
    import sys
    from app.db import SessionLocal, init_db

    logging.basicConfig(level=logging.INFO)
    init_db()
    db = SessionLocal()
    force_flag = "--force" in sys.argv
    seed_database(db, force=force_flag)
    db.close()
