"""Synthetic railway network generator.

Produces a deterministic Southern Railway corridor (Tamil Nadu: Chennai Egmore – Madurai)
with 10 stations, derived blocks, junctions, and passing loops.
All derived infrastructure is tagged ASSUMED.

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

# 10 stations on the Southern Railway Tamil Nadu Corridor (Chennai Egmore – Madurai Trunk)
_STATIONS: list[SyntheticStation] = [
    SyntheticStation("MS",   "Chennai Egmore",       13.0827,  80.2707, is_junction=True,      platform_count=11),
    SyntheticStation("TBM",  "Tambaram",             12.9249,  80.1278, is_junction=True,      has_passing_loop=True, platform_count=8),
    SyntheticStation("CGL",  "Chengalpattu Jn",      12.6841,  79.9836, is_junction=True,      has_passing_loop=True, platform_count=6),
    SyntheticStation("VM",   "Villupuram Jn",        11.9398,  79.4920, is_junction=True,      has_passing_loop=True, platform_count=6),
    SyntheticStation("TPJ",  "Tiruchirappalli Jn",   10.7905,  78.7047, is_junction=True,      has_passing_loop=True, platform_count=8),
    SyntheticStation("DG",   "Dindigul Jn",          10.3624,  77.9695, is_junction=True,      has_passing_loop=True, platform_count=5),
    SyntheticStation("MDU",  "Madurai Jn",            9.9195,  78.1193, is_junction=True,      platform_count=8),
    SyntheticStation("TJ",   "Thanjavur Jn",         10.7870,  79.1378, is_junction=True,      has_passing_loop=True, platform_count=5),
    SyntheticStation("SA",   "Salem Jn",             11.6643,  78.1460, is_junction=True,      has_passing_loop=True, platform_count=6),
    SyntheticStation("KPD",  "Katpadi Jn",           12.9796,  79.1368, is_junction=True,      has_passing_loop=True, platform_count=6),
]

# Sections (ordered along the Southern Railway corridor)
_SECTIONS: list[SyntheticSection] = [
    SyntheticSection("MS",   "CGL",  55,  55.0, is_double_track=True,  headway_min=3),
    SyntheticSection("CGL",  "VM",   90,  90.0, is_double_track=False, headway_min=5),  # Single track section
    SyntheticSection("VM",   "TPJ", 120, 120.0, is_double_track=True,  headway_min=4),
    SyntheticSection("TPJ",  "MDU", 100, 100.0, is_double_track=True,  headway_min=4),
    SyntheticSection("TPJ",  "DG",   65,  65.0, is_double_track=False, headway_min=5),
    SyntheticSection("DG",   "MDU",  45,  45.0, is_double_track=False, headway_min=5),
    SyntheticSection("MS",   "TJ",  180, 180.0, is_double_track=True,  headway_min=4),
    SyntheticSection("TJ",   "MDU", 120, 120.0, is_double_track=True,  headway_min=4),
    SyntheticSection("CGL",  "KPD",  90,  90.0, is_double_track=True,  headway_min=4),
    SyntheticSection("TPJ",  "SA",  140, 140.0, is_double_track=False, headway_min=5),
]

_JUNCTIONS: list[SyntheticJunction] = [
    SyntheticJunction("JN-MS",  "Chennai Egmore Junction",  "MS",  ["MS-CGL", "MS-TJ"]),
    SyntheticJunction("JN-CGL", "Chengalpattu Junction",    "CGL", ["MS-CGL", "CGL-VM", "CGL-KPD"]),
    SyntheticJunction("JN-VM",  "Villupuram Junction",      "VM",  ["CGL-VM", "VM-TPJ"]),
    SyntheticJunction("JN-TPJ", "Tiruchirappalli Junction", "TPJ", ["VM-TPJ", "TPJ-MDU", "TPJ-DG", "TPJ-SA"]),
    SyntheticJunction("JN-MDU", "Madurai Junction",         "MDU", ["TPJ-MDU", "DG-MDU", "TJ-MDU"]),
]

_LOOPS: list[SyntheticLoop] = [
    SyntheticLoop("LP-CGL", "CGL", capacity_trains=2),
    SyntheticLoop("LP-VM",  "VM",  capacity_trains=2),
    SyntheticLoop("LP-TPJ", "TPJ", capacity_trains=3),
    SyntheticLoop("LP-DG",  "DG",  capacity_trains=2),
    SyntheticLoop("LP-TJ",  "TJ",  capacity_trains=2),
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
    """Build a deterministic set of 12 South Indian trains on the corridor (ASSUMED)."""

    # Main up corridor: MS → MDU via CGL, VM, TPJ
    up_main = ["MS", "CGL", "VM", "TPJ", "MDU"]
    # Down corridor: MDU → MS
    down_main = list(reversed(up_main))
    # Alternate via Thanjavur delta loop
    up_loop = ["MS", "TJ", "MDU"]
    down_loop = list(reversed(up_loop))

    # Running times per section (minutes)
    rt = {
        ("MS",  "CGL"):  55, ("CGL", "MS"):   55,
        ("CGL", "VM"):   90, ("VM",  "CGL"):  90,
        ("VM",  "TPJ"): 120, ("TPJ", "VM"):  120,
        ("TPJ", "MDU"): 100, ("MDU", "TPJ"): 100,
        ("MS",  "TJ"):  180, ("TJ",  "MS"):  180,
        ("TJ",  "MDU"): 120, ("MDU", "TJ"):  120,
        ("TPJ", "DG"):   65, ("DG",  "TPJ"):  65,
        ("DG",  "MDU"):  45, ("MDU", "DG"):   45,
        ("CGL", "KPD"):  90, ("KPD", "CGL"):  90,
        ("TPJ", "SA"):  140, ("SA",  "TPJ"): 140,
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
        # Express trains (up, Chennai Egmore → Madurai Jn, high priority)
        SyntheticTrain("12635", "Vaigai Superfast",       "express",   "up",   1,
                       make_stops(up_main, _minutes(6, 0))),
        SyntheticTrain("20605", "Vande Bharat Express",   "express",   "up",   1,
                       make_stops(up_main, _minutes(8, 10))),
        SyntheticTrain("12637", "Pandian Superfast",      "express",   "up",   2,
                       make_stops(up_main, _minutes(9, 30))),
        SyntheticTrain("16127", "Guruvayur Express",      "express",   "up",   2,
                       make_stops(up_main, _minutes(12, 0))),
        # Passenger trains (up, medium priority)
        SyntheticTrain("56829", "Tiruchirappalli Pass",   "passenger", "up",   5,
                       make_stops(up_main, _minutes(7, 0))),
        SyntheticTrain("56705", "Villupuram Madurai Pass","passenger", "up",   5,
                       make_stops(up_main, _minutes(10, 30))),
        # Loop-route trains (up via Thanjavur)
        SyntheticTrain("16187", "Delta Queen Express",    "express",   "up",   3,
                       make_stops(up_loop, _minutes(11, 0))),
        # Down trains (Madurai Jn → Chennai Egmore)
        SyntheticTrain("12636", "Vaigai Superfast Dn",    "express",   "down", 1,
                       make_stops(down_main, _minutes(17, 0))),
        SyntheticTrain("20606", "Vande Bharat Dn",        "express",   "down", 1,
                       make_stops(down_main, _minutes(15, 30))),
        SyntheticTrain("12638", "Pandian Superfast Dn",   "express",   "down", 2,
                       make_stops(down_main, _minutes(18, 0))),
        SyntheticTrain("56830", "Madurai Trichy Pass Dn", "passenger", "down", 5,
                       make_stops(down_main, _minutes(16, 0))),
        SyntheticTrain("16188", "Delta Queen Dn",         "express",   "down", 3,
                       make_stops(down_loop, _minutes(16, 30))),
    ]
    return trains


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_synthetic_network(blocks_per_section: int = 2) -> SyntheticNetwork:
    """Return the full synthetic Southern Railway corridor network.

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
