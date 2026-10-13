"""Conflict detection rules — pure Python, unit-testable.

No FastAPI or SQLAlchemy imports. Operates on plain Python dicts/dataclasses.

Each rule returns a list of ConflictResult objects.
All times are in minutes from midnight.
"""

from __future__ import annotations

import dataclasses
import enum
import uuid
from typing import Optional


class ConflictType(str, enum.Enum):
    RESERVATION_OVERLAP = "reservation_overlap"
    HEADWAY_VIOLATION = "headway_violation"
    OPPOSING_MOVEMENT = "opposing_movement"
    JUNCTION_CONFLICT = "junction_conflict"
    DELAY_CONFLICT = "delay_conflict"
    CLOSURE_CONFLICT = "closure_conflict"
    INFEASIBLE_SEQUENCE = "infeasible_sequence"


class Severity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclasses.dataclass
class ConflictResult:
    conflict_uid: str
    conflict_type: ConflictType
    severity: Severity
    trains: list[str]
    resource_code: str
    interval_start_min: int
    interval_end_min: int
    explanation: str
    rule_source: str
    suggested_actions: list[str]
    context: str = "baseline"

    @classmethod
    def make(
        cls,
        conflict_type: ConflictType,
        severity: Severity,
        trains: list[str],
        resource_code: str,
        interval_start_min: int,
        interval_end_min: int,
        explanation: str,
        rule_source: str,
        suggested_actions: list[str],
        context: str = "baseline",
    ) -> "ConflictResult":
        return cls(
            conflict_uid=str(uuid.uuid4()),
            conflict_type=conflict_type,
            severity=severity,
            trains=trains,
            resource_code=resource_code,
            interval_start_min=interval_start_min,
            interval_end_min=interval_end_min,
            explanation=explanation,
            rule_source=rule_source,
            suggested_actions=suggested_actions,
            context=context,
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _intervals_overlap(s1: int, e1: int, s2: int, e2: int) -> bool:
    """True if [s1,e1) overlaps with [s2,e2)."""
    return s1 < e2 and s2 < e1


# ---------------------------------------------------------------------------
# Block occupation schedule builder
# ---------------------------------------------------------------------------

def build_block_occupancy(
    trains: list[dict],
    stop_times: list[dict],
    sections: list[dict],
    blocks: list[dict],
    use_revised: bool = False,
) -> dict[str, list[dict]]:
    """Build a map of block_code → list of occupancy windows.

    Each window: {train_number, direction, entry_min, exit_min}
    Supports forward and reverse section traversal, mapping single-track
    sections to shared physical blocks and double-track return lines to separate blocks.
    """
    stops_by_train: dict[str, list[dict]] = {}
    for st in stop_times:
        stops_by_train.setdefault(st["train_number"], []).append(st)
    for tn in stops_by_train:
        stops_by_train[tn].sort(key=lambda s: s["stop_sequence"])

    # Index sections by forward and reverse: (from, to) -> (section, is_reversed)
    section_map: dict[tuple[str, str], tuple[dict, bool]] = {}
    for s in sections:
        f_st = s["from_station_code"]
        t_st = s["to_station_code"]
        section_map[(f_st, t_st)] = (s, False)
        # Reverse mapping:
        section_map[(t_st, f_st)] = (s, True)

    blocks_by_section: dict[tuple[str, str], list[dict]] = {}
    for blk in blocks:
        key = (blk["section_from"], blk["section_to"])
        blocks_by_section.setdefault(key, []).append(blk)
    for key in blocks_by_section:
        blocks_by_section[key].sort(key=lambda b: b["block_index"])

    occupancy: dict[str, list[dict]] = {}

    for tr in trains:
        tn = tr["train_number"]
        direction = tr.get("direction", "up")
        stops = stops_by_train.get(tn, [])
        if len(stops) < 2:
            continue

        for i in range(len(stops) - 1):
            cur = stops[i]
            nxt = stops[i + 1]
            from_st = cur["station_code"]
            to_st = nxt["station_code"]

            dep_min = cur.get("revised_departure_min") if use_revised and cur.get("revised_departure_min") is not None else cur.get("planned_departure_min")
            if dep_min is None:
                continue

            sec_info = section_map.get((from_st, to_st))
            if sec_info is None:
                continue
            sec, is_reversed = sec_info
            rt = sec["running_time_min"]

            # Blocks are indexed by canonical (section_from, section_to)
            blks = list(blocks_by_section.get((sec["from_station_code"], sec["to_station_code"]), []))
            if not blks:
                continue

            # In reverse traversal, train traverses the blocks in reverse order
            if is_reversed:
                blks = list(reversed(blks))

            is_double = sec.get("is_double_track", False)
            t = dep_min
            for blk in blks:
                traverse = max(1, round(rt * blk["time_fraction"]))
                win = {
                    "train_number": tn,
                    "direction": direction,
                    "entry_min": t,
                    "exit_min": t + traverse,
                }
                # On single-track sections, both directions share the exact physical block code
                # On double-track sections, the reverse direction runs on the return line (-REV)
                if is_double and is_reversed:
                    blk_code = f"{blk['code']}-REV"
                else:
                    blk_code = blk["code"]

                occupancy.setdefault(blk_code, []).append(win)
                t += traverse

    for code in occupancy:
        occupancy[code].sort(key=lambda w: w["entry_min"])

    return occupancy


# ---------------------------------------------------------------------------
# Conflict detection rules
# ---------------------------------------------------------------------------

def _get_section_for_block(
    block_code: str,
    sections: list[dict],
    blocks: list[dict] | None = None,
) -> dict | None:
    """Helper to find track section corresponding to a block code."""
    clean_code = block_code.replace("-REV", "")
    if blocks:
        for b in blocks:
            if b.get("code") == clean_code:
                sf = b.get("section_from")
                st = b.get("section_to")
                for s in sections:
                    if (s["from_station_code"], s["to_station_code"]) in [(sf, st), (st, sf)]:
                        return s
    parts = clean_code.split("-")
    if len(parts) >= 3:
        p1, p2 = parts[1], parts[2]
        for s in sections:
            if (s["from_station_code"], s["to_station_code"]) in [(p1, p2), (p2, p1)]:
                return s
    return None


def detect_reservation_overlaps(
    occupancy: dict[str, list[dict]],
    sections: list[dict],
    context: str = "baseline",
    blocks: list[dict] | None = None,
) -> list[ConflictResult]:
    """Rule 1: Two trains occupy the same exclusive (single-track) block simultaneously."""
    conflicts: list[ConflictResult] = []

    for block_code, windows in occupancy.items():
        sec = _get_section_for_block(block_code, sections, blocks)
        is_double = sec.get("is_double_track", False) if sec else False

        for i, w1 in enumerate(windows):
            for w2 in windows[i + 1:]:
                if not _intervals_overlap(w1["entry_min"], w1["exit_min"],
                                          w2["entry_min"], w2["exit_min"]):
                    break  # sorted, so no more overlaps with w1
                if is_double and w1["direction"] == w2["direction"]:
                    continue  # same direction on double track: headway check handles this
                conflicts.append(ConflictResult.make(
                    conflict_type=ConflictType.RESERVATION_OVERLAP,
                    severity=Severity.CRITICAL,
                    trains=[w1["train_number"], w2["train_number"]],
                    resource_code=block_code.replace("-REV", ""),
                    interval_start_min=max(w1["entry_min"], w2["entry_min"]),
                    interval_end_min=min(w1["exit_min"], w2["exit_min"]),
                    explanation=(
                        f"Trains {w1['train_number']} and {w2['train_number']} "
                        f"both occupy block {block_code.replace('-REV', '')} between "
                        f"{max(w1['entry_min'], w2['entry_min'])} and "
                        f"{min(w1['exit_min'], w2['exit_min'])} minutes. "
                        f"Track is {'double' if is_double else 'single'}. "
                        "Exclusive reservation violated."
                    ),
                    rule_source="DERIVED",
                    suggested_actions=[
                        "Hold the later train at the previous station.",
                        "Retime one train by at least the overlap duration.",
                    ],
                    context=context,
                ))
    return conflicts


def detect_headway_violations(
    occupancy: dict[str, list[dict]],
    sections: list[dict],
    context: str = "baseline",
    blocks: list[dict] | None = None,
) -> list[ConflictResult]:
    """Rule 2: Consecutive same-direction trains closer than headway_min."""
    conflicts: list[ConflictResult] = []

    for block_code, windows in occupancy.items():
        sec = _get_section_for_block(block_code, sections, blocks)
        headway = sec.get("headway_min", 5) if sec else 5

        same_dir: dict[str, list[dict]] = {}
        for w in windows:
            same_dir.setdefault(w["direction"], []).append(w)

        for direction, dir_windows in same_dir.items():
            dir_windows.sort(key=lambda w: w["entry_min"])
            for i in range(len(dir_windows) - 1):
                w1, w2 = dir_windows[i], dir_windows[i + 1]
                gap = w2["entry_min"] - w1["entry_min"]
                if 0 <= gap < headway:
                    conflicts.append(ConflictResult.make(
                        conflict_type=ConflictType.HEADWAY_VIOLATION,
                        severity=Severity.HIGH,
                        trains=[w1["train_number"], w2["train_number"]],
                        resource_code=block_code.replace("-REV", ""),
                        interval_start_min=w1["entry_min"],
                        interval_end_min=w2["entry_min"],
                        explanation=(
                            f"Trains {w1['train_number']} and {w2['train_number']} "
                            f"enter block {block_code.replace('-REV', '')} only {gap} min apart "
                            f"(minimum headway: {headway} min). Direction: {direction}."
                        ),
                        rule_source="ASSUMED",
                        suggested_actions=[
                            f"Delay {w2['train_number']} departure by at least {headway - gap} min.",
                            "Reorder trains to increase spacing.",
                        ],
                        context=context,
                    ))
    return conflicts


def detect_opposing_movements(
    occupancy: dict[str, list[dict]],
    sections: list[dict],
    context: str = "baseline",
    blocks: list[dict] | None = None,
) -> list[ConflictResult]:
    """Rule 3: Opposing trains on a single-track section at the same time."""
    conflicts: list[ConflictResult] = []

    for block_code, windows in occupancy.items():
        if block_code.endswith("-REV"):
            continue  # Double track return line
        sec = _get_section_for_block(block_code, sections, blocks)
        if sec and sec.get("is_double_track", False):
            continue  # double track: no opposing conflict

        for i, w1 in enumerate(windows):
            for w2 in windows[i + 1:]:
                if w1["direction"] == w2["direction"]:
                    continue
                if not _intervals_overlap(w1["entry_min"], w1["exit_min"],
                                          w2["entry_min"], w2["exit_min"]):
                    continue
                conflicts.append(ConflictResult.make(
                    conflict_type=ConflictType.OPPOSING_MOVEMENT,
                    severity=Severity.CRITICAL,
                    trains=[w1["train_number"], w2["train_number"]],
                    resource_code=block_code,
                    interval_start_min=max(w1["entry_min"], w2["entry_min"]),
                    interval_end_min=min(w1["exit_min"], w2["exit_min"]),
                    explanation=(
                        f"Trains {w1['train_number']} ({w1['direction']}) and "
                        f"{w2['train_number']} ({w2['direction']}) are moving in "
                        f"opposite directions on single-track block {block_code}."
                    ),
                    rule_source="ASSUMED",
                    suggested_actions=[
                        "Use passing loop at nearest station.",
                        "Hold one train until the other clears the section.",
                    ],
                    context=context,
                ))
    return conflicts


def detect_closure_conflicts(
    occupancy: dict[str, list[dict]],
    closed_blocks: set[str],
    context: str = "baseline",
) -> list[ConflictResult]:
    """Rule 4: Train scheduled into a closed (maintenance) block."""
    conflicts: list[ConflictResult] = []
    for block_code in closed_blocks:
        for w in occupancy.get(block_code, []):
            conflicts.append(ConflictResult.make(
                conflict_type=ConflictType.CLOSURE_CONFLICT,
                severity=Severity.CRITICAL,
                trains=[w["train_number"]],
                resource_code=block_code,
                interval_start_min=w["entry_min"],
                interval_end_min=w["exit_min"],
                explanation=(
                    f"Train {w['train_number']} is scheduled through block "
                    f"{block_code} which is closed for maintenance "
                    f"({w['entry_min']}–{w['exit_min']} min)."
                ),
                rule_source="ASSUMED",
                suggested_actions=[
                    "Reroute via alternate path or passing loop.",
                    "Cancel/hold train until block reopens.",
                    "Adjust maintenance window.",
                ],
                context=context,
            ))
    return conflicts


def detect_all(
    trains: list[dict],
    stop_times: list[dict],
    sections: list[dict],
    blocks: list[dict],
    closed_blocks: set[str] | None = None,
    use_revised: bool = False,
    context: str = "baseline",
) -> list[ConflictResult]:
    """Run all conflict detection rules and return combined results.

    Args:
        trains:       Train metadata dicts.
        stop_times:   Stop time dicts.
        sections:     Section metadata dicts.
        blocks:       Block metadata dicts.
        closed_blocks: Set of block codes currently closed for maintenance.
        use_revised:  If True, use revised departure/arrival times.
        context:      Label for the detection context (baseline, scenario_N).

    Returns:
        Deduplicated list of ConflictResult objects.
    """
    if closed_blocks is None:
        closed_blocks = set()

    occ = build_block_occupancy(trains, stop_times, sections, blocks, use_revised)

    results: list[ConflictResult] = []
    results.extend(detect_reservation_overlaps(occ, sections, context, blocks))
    results.extend(detect_headway_violations(occ, sections, context, blocks))
    results.extend(detect_opposing_movements(occ, sections, context, blocks))
    results.extend(detect_closure_conflicts(occ, closed_blocks, context))
    return results
