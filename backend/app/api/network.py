"""Network graph API router.

Returns the full graph (stations, sections, blocks, junctions, loops)
built from the database.  The frontend MUST use only this endpoint to
render the network; never hardcode graph data in the frontend.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.infrastructure import Block, Junction, PassingLoop, Station, TrackSection
from app.schemas.network import NetworkResponse

router = APIRouter(prefix="/api", tags=["network"])


@router.get("/network", response_model=NetworkResponse)
def get_network(db: Session = Depends(get_db)) -> NetworkResponse:
    """Return the full railway network graph for frontend rendering."""
    stations = db.query(Station).all()
    sections = db.query(TrackSection).all()
    blocks = db.query(Block).all()
    junctions = db.query(Junction).all()
    loops = db.query(PassingLoop).all()

    station_map = {s.id: s.code for s in stations}

    station_dicts = [
        {
            "id": s.id,
            "code": s.code,
            "name": s.name,
            "lat": s.lat,
            "lon": s.lon,
            "is_junction": s.is_junction,
            "has_passing_loop": s.has_passing_loop,
            "platform_count": s.platform_count,
            "provenance": s.provenance,
        }
        for s in stations
    ]

    section_dicts = [
        {
            "id": sec.id,
            "from_station_code": station_map.get(sec.from_station_id, ""),
            "to_station_code": station_map.get(sec.to_station_id, ""),
            "running_time_min": sec.running_time_min,
            "distance_km": sec.distance_km,
            "is_double_track": sec.is_double_track,
            "headway_min": sec.headway_min,
            "provenance": sec.provenance,
        }
        for sec in sections
    ]

    sec_map = {sec.id: sec for sec in sections}

    block_dicts = [
        {
            "id": blk.id,
            "code": blk.code,
            "section_from": station_map.get(sec_map[blk.section_id].from_station_id, "") if blk.section_id in sec_map else "",
            "section_to": station_map.get(sec_map[blk.section_id].to_station_id, "") if blk.section_id in sec_map else "",
            "block_index": blk.block_index,
            "time_fraction": blk.time_fraction,
            "state": blk.state,
            "provenance": blk.provenance,
        }
        for blk in blocks
    ]

    junction_dicts = [
        {
            "id": jn.id,
            "code": jn.code,
            "name": jn.name,
            "station_code": station_map.get(jn.station_id, "") if jn.station_id else "",
            "section_codes": json.loads(jn.section_ids_json) if jn.section_ids_json else [],
            "provenance": jn.provenance,
        }
        for jn in junctions
    ]

    loop_dicts = [
        {
            "id": lp.id,
            "code": lp.code,
            "station_code": station_map.get(lp.station_id, ""),
            "capacity_trains": lp.capacity_trains,
            "provenance": lp.provenance,
        }
        for lp in loops
    ]

    return NetworkResponse(
        stations=station_dicts,
        sections=section_dicts,
        blocks=block_dicts,
        junctions=junction_dicts,
        passing_loops=loop_dicts,
    )
