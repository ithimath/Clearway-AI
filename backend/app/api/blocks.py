"""Block occupancy API router."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.infrastructure import Block, TrackSection, Station

router = APIRouter(prefix="/api", tags=["blocks"])


@router.get("/blocks")
def list_blocks(db: Session = Depends(get_db)) -> list[dict]:
    """Return all blocks with their current state."""
    blocks = db.query(Block).all()
    sections = {s.id: s for s in db.query(TrackSection).all()}
    stations = {s.id: s.code for s in db.query(Station).all()}

    result = []
    for blk in blocks:
        sec = sections.get(blk.section_id)
        from_code = stations.get(sec.from_station_id, "") if sec else ""
        to_code = stations.get(sec.to_station_id, "") if sec else ""
        result.append(
            {
                "id": blk.id,
                "code": blk.code,
                "section_from": from_code,
                "section_to": to_code,
                "block_index": blk.block_index,
                "time_fraction": blk.time_fraction,
                "state": blk.state,
                "provenance": blk.provenance,
            }
        )
    return result
