"""Synthetic railway network generator.

Produces a deterministic Delhi–Agra corridor with 10 stations, derived blocks,
one junction, and one passing loop.  All derived infrastructure is tagged ASSUMED.

Units: times in minutes from midnight, distances in km.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data structures (pure Python, no ORM / FastAPI imports)
# ---------------------------------------------------------------------------

@dataclass
class SyntheticStation:
    code: str
    name: str
    lat: float
    lon: float
    is_junction: bool = False
    has_passing_loop: bool = False
    platform_count: int = 2
    provenance: str = "ASSUMED"


@dataclass
class SyntheticSection:
    from_code: str
    to_code: str
    running_time_min: int
    distance_km: float
    is_double_track: bool = False
    headway_min: int = 5
    provenance: str = "ASSUMED"


@dataclass
class SyntheticBlock:
    code: str
    section_from: str
    section_to: str
    block_index: int
    time_fraction: float
    provenance: str = "ASSUMED"


@dataclass
class SyntheticJunction:
    code: str
    name: str
    at_station_code: str
    section_codes: list[str] = field(default_factory=list)
    provenance: str = "ASSUMED"


@dataclass
class SyntheticLoop:
    code: str
    at_station_code: str
    capacity_trains: int = 1
    provenance: str = "ASSUMED"


@dataclass
class SyntheticTrain:
    number: str
    name: str
    train_type: str
    direction: str
    priority: int
    stops: list[dict]  # {station_code, arrival_min, departure_min, dwell_min}
    provenance: str = "ASSUMED"


@dataclass
class SyntheticNetwork:
    stations: list[SyntheticStation]
    sections: list[SyntheticSection]
    blocks: list[SyntheticBlock]
    junctions: list[SyntheticJunction]
    loops: list[SyntheticLoop]
    trains: list[SyntheticTrain]


# ---------------------------------------------------------------------------
# Corridor definition (ASSUMED data, deterministic)
# ---------------------------------------------------------------------------

# 10 stations on a simplified Delhi–Agra corridor
_STATIONS: list[SyntheticStation] = [
    SyntheticStation("NDLS", "New Delhi",      28.6139,  77.2090, is_junction=True,      platform_count=16),
    SyntheticStation("MTJ",  "Mathura Jn",     27.4924,  77.6737, is_junction=True,      has_passing_loop=True, platform_count=6),
    SyntheticStation("GZB",  "Ghaziabad",      28.6692,  77.4538, platform_count=4),
    SyntheticStation("ALJN", "Aligarh Jn",     27.8895,  78.0782, has_passing_loop=True, platform_count=4),
    SyntheticStation("TDL",  "Tundla Jn",      27.2004,  78.2391, is_junction=True,      platform_count=4),
    SyntheticStation("AGC",  "Agra Cantt",     27.1591,  77.9550, platform_count=8),
    SyntheticStation("PRYJ", "Prayagraj Jn",   25.4358,  81.8463, is_junction=True,      platform_count=10),
    SyntheticStation("CNB",  "Kanpur Central", 26.4499,  80.3319, platform_count=10),
    SyntheticStation("ETP",  "Etawah",         26.7746,  79.0225, has_passing_loop=True, platform_count=3),
    SyntheticStation("FZDB", "Faizabad",       26.7750,  82.1373, platform_count=3),
]

# Sections (ordered along the corridor)
_SECTIONS: list[SyntheticSection] = [
    SyntheticSection("NDLS", "GZB",  22, 22.0, is_double_track=True,  headway_min=3),
    SyntheticSection("GZB",  "ALJN", 90, 90.0, is_double_track=False, headway_min=5),
    SyntheticSection("ALJN", "TDL",  40, 40.0, is_double_track=False, headway_min=5),
    SyntheticSection("TDL",  "AGC",  18, 18.0, is_double_track=True,  headway_min=4),
    SyntheticSection("TDL",  "ETP",  52, 52.0, is_double_track=False, headway_min=5),
    SyntheticSection("ETP",  "CNB",  83, 83.0, is_double_track=False, headway_min=5),
    SyntheticSection("CNB",  "PRYJ",120,120.0, is_double_track=True,  headway_min=4),
    SyntheticSection("AGC",  "MTJ",  40, 40.0, is_double_track=True,  headway_min=4),
    SyntheticSection("MTJ",  "NDLS", 95, 95.0, is_double_track=True,  headway_min=4),
    SyntheticSection("PRYJ", "FZDB",155,155.0, is_double_track=False, headway_min=5),
]

_JUNCTIONS: list[SyntheticJunction] = [
    SyntheticJunction("JN-NDLS", "New Delhi Junction", "NDLS",
                      ["NDLS-GZB", "MTJ-NDLS"]),
    SyntheticJunction("JN-TDL",  "Tundla Junction",   "TDL",
                      ["ALJN-TDL", "TDL-AGC", "TDL-ETP"]),
    SyntheticJunction("JN-MTJ",  "Mathura Junction",  "MTJ",
                      ["AGC-MTJ", "MTJ-NDLS"]),
]

_LOOPS: list[SyntheticLoop] = [
    SyntheticLoop("LP-MTJ",  "MTJ",  capacity_trains=1),
    SyntheticLoop("LP-ALJN", "ALJN", capacity_trains=1),
    SyntheticLoop("LP-ETP",  "ETP",  capacity_trains=1),
]


def _section_code(frm: str, to: str) -> str:
    return f"{frm}-{to}"


def _derive_blocks(sections: list[SyntheticSection], blocks_per_section: int) -> list[SyntheticBlock]:
    """Derive blocks by splitting each section into N equal-time blocks (ASSUMED)."""
    blocks: list[SyntheticBlock] = []
    frac = 1.0 / blocks_per_section
    for sec in sections:
        for i in range(blocks_per_section):
            code = f"BLK-{sec.from_code}-{sec.to_code}-{i}"
            blocks.append(SyntheticBlock(
                code=code,
                section_from=sec.from_code,
                section_to=sec.to_code,
                block_index=i,
                time_fraction=frac,
            ))
    return blocks


# ---------------------------------------------------------------------------
# Train schedule generator (ASSUMED timetable)
# ---------------------------------------------------------------------------

def _minutes(h: int, m: int) -> int:
    """Convert HH:MM to minutes from midnight."""
    return h * 60 + m


def _build_trains() -> list[SyntheticTrain]:
    """Build a deterministic set of 12 trains on the corridor (ASSUMED)."""

    # Main up corridor: NDLS → AGC via GZB, ALJN, TDL
    up_main = ["NDLS", "GZB", "ALJN", "TDL", "AGC"]
    # Down corridor: AGC → NDLS
    down_main = list(reversed(up_main))
    # Alternate via MTJ loop
    up_loop = ["NDLS", "MTJ", "AGC"]
    down_loop = list(reversed(up_loop))

    # Running times per section (minutes)
    rt = {
        ("NDLS", "GZB"):  22, ("GZB", "NDLS"):  22,
        ("GZB",  "ALJN"): 90, ("ALJN", "GZB"):  90,
        ("ALJN", "TDL"):  40, ("TDL", "ALJN"):  40,
        ("TDL",  "AGC"):  18, ("AGC", "TDL"):   18,
        ("NDLS", "MTJ"):  95, ("MTJ", "NDLS"):  95,
        ("MTJ",  "AGC"):  40, ("AGC", "MTJ"):   40,
        ("TDL",  "ETP"):  52, ("ETP", "TDL"):   52,
        ("ETP",  "CNB"):  83, ("CNB", "ETP"):   83,
        ("CNB",  "PRYJ"):120, ("PRYJ","CNB"):  120,
        ("PRYJ", "FZDB"):155, ("FZDB","PRYJ"): 155,
    }
    dwell = 2  # default dwell minutes

    def make_stops(stations: list[str], dep_start_min: int) -> list[dict]:
        stops = []
        t = dep_start_min
        for i, s in enumerate(stations):
            arr = t if i > 0 else None
            dep = t + dwell if i < len(stations) - 1 else None
            stops.append({
                "station_code": s,
                "arrival_min": arr,
                "departure_min": dep,
                "dwell_min": dwell if (arr is not None and dep is not None) else 0,
            })
            if i < len(stations) - 1:
                t += dwell + rt.get((s, stations[i + 1]), 60)
        return stops

    trains: list[SyntheticTrain] = [
        # Express trains (up, high priority)
        SyntheticTrain("12001", "Shatabdi Exp",       "express",   "up",   1,
                       make_stops(up_main, _minutes(6, 0))),
        SyntheticTrain("12003", "Gatimaan Exp",       "express",   "up",   1,
                       make_stops(up_main, _minutes(8, 10))),
        SyntheticTrain("12005", "Rajdhani Exp",       "express",   "up",   2,
                       make_stops(up_main, _minutes(9, 30))),
        SyntheticTrain("12007", "Taj Exp",            "express",   "up",   2,
                       make_stops(up_main, _minutes(12, 0))),
        # Passenger trains (up, medium priority)
        SyntheticTrain("51901", "Delhi Agra Pass",    "passenger", "up",   5,
                       make_stops(up_main, _minutes(7, 0))),
        SyntheticTrain("51903", "Intercity Pass",     "passenger", "up",   5,
                       make_stops(up_main, _minutes(10, 30))),
        # Loop-route trains (up)
        SyntheticTrain("14001", "Mathura Loop Exp",   "express",   "up",   3,
                       make_stops(up_loop, _minutes(11, 0))),
        # Down trains
        SyntheticTrain("12002", "Shatabdi Dn",        "express",   "down", 1,
                       make_stops(down_main, _minutes(17, 0))),
        SyntheticTrain("12004", "Gatimaan Dn",        "express",   "down", 1,
                       make_stops(down_main, _minutes(15, 30))),
        SyntheticTrain("12006", "Rajdhani Dn",        "express",   "down", 2,
                       make_stops(down_main, _minutes(18, 0))),
        SyntheticTrain("51902", "Delhi Agra Pass Dn", "passenger", "down", 5,
                       make_stops(down_main, _minutes(16, 0))),
        SyntheticTrain("14002", "Mathura Loop Dn",    "express",   "down", 3,
                       make_stops(down_loop, _minutes(16, 30))),
    ]
    return trains


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_synthetic_network(blocks_per_section: int = 2) -> SyntheticNetwork:
    """Return the full synthetic corridor network.

    Args:
        blocks_per_section: Number of blocks to derive per section (ASSUMED).

    Returns:
        SyntheticNetwork with stations, sections, blocks, junctions, loops, trains.
    """
    blocks = _derive_blocks(_SECTIONS, blocks_per_section)
    trains = _build_trains()
    return SyntheticNetwork(
        stations=_STATIONS,
        sections=_SECTIONS,
        blocks=blocks,
        junctions=_JUNCTIONS,
        loops=_LOOPS,
        trains=trains,
    )
