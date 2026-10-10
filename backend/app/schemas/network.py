"""Pydantic schemas for the network graph API response."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel


class StationSchema(BaseModel):
    id: int
    code: str
    name: str
    lat: float
    lon: float
    is_junction: bool
    has_passing_loop: bool
    platform_count: int
    provenance: str


class SectionSchema(BaseModel):
    id: int
    from_station_code: str
    to_station_code: str
    running_time_min: int
    distance_km: float
    is_double_track: bool
    headway_min: int
    provenance: str


class BlockSchema(BaseModel):
    id: int
    code: str
    section_from: str
    section_to: str
    block_index: int
    time_fraction: float
    state: str
    provenance: str


class JunctionSchema(BaseModel):
    id: int
    code: str
    name: str
    station_code: str
    section_codes: list[str]
    provenance: str


class PassingLoopSchema(BaseModel):
    id: int
    code: str
    station_code: str
    capacity_trains: int
    provenance: str


class NetworkResponse(BaseModel):
    stations: list[StationSchema]
    sections: list[SectionSchema]
    blocks: list[BlockSchema]
    junctions: list[JunctionSchema]
    passing_loops: list[PassingLoopSchema]
