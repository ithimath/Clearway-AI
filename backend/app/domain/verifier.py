"""Independent plain-Python schedule verification engine for Clearway AI.

CRITICAL ARCHITECTURE REQUIREMENT:
- Pure Python standard library only.
- NO OR-Tools imports.
- NO shared code with solver models.
- Operates on plain Python dicts and standard data structures.
- Advisory verification for railway block planning prototypes.
"""

from __future__ import annotations

import dataclasses
import enum
from typing import Any


class ViolationSeverity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ViolationType(str, enum.Enum):
    RESERVATION_OVERLAP = "reservation_overlap"
    HEADWAY_VIOLATION = "headway_violation"
    OPPOSING_MOVEMENT = "opposing_movement"
    CLOSURE_VIOLATION = "closure_violation"
    STATION_CAPACITY_EXCEEDED = "station_capacity_exceeded"
    MIN_DWELL_VIOLATION = "min_dwell_violation"
    CONTINUITY_VIOLATION = "continuity_violation"


@dataclasses.dataclass(frozen=True)
class VerificationViolation:
    violation_type: ViolationType
    severity: ViolationSeverity
    resource_code: str
    trains: tuple[str, ...]
    start_min: int
    end_min: int
    details: str


@dataclasses.dataclass
class VerificationResult:
    is_valid: bool
    violation_count: int
    violations: list[VerificationViolation]
    checks_passed: list[str]
    checks_failed: list[str]
    metrics: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "violation_count": self.violation_count,
            "violations": [
                {
                    "type": v.violation_type.value,
                    "severity": v.severity.value,
                    "resource": v.resource_code,
                    "trains": list(v.trains),
                    "start_min": v.start_min,
                    "end_min": v.end_min,
                    "details": v.details,
                }
                for v in self.violations
            ],
            "checks_passed": self.checks_passed,
            "checks_failed": self.checks_failed,
            "metrics": self.metrics,
        }


def _intervals_overlap(s1: int, e1: int, s2: int, e2: int) -> bool:
    """True if [s1, e1) overlaps with [s2, e2)."""
    return s1 < e2 and s2 < e1


def compute_independent_block_occupancies(
    trains: list[dict],
    stop_times: list[dict],
    sections: list[dict],
    blocks: list[dict],
) -> dict[str, list[dict[str, Any]]]:
    """Independently reconstruct block occupancy windows from schedule stops.

    Each window: {
        'train_number': str,
        'direction': str,
        'entry_min': int,
        'exit_min': int,
        'block_code': str,
        'is_double_track': bool,
    }
    """
    stops_by_train: dict[str, list[dict]] = {}
    for st in stop_times:
        stops_by_train.setdefault(st["train_number"], []).append(st)
    for tn in stops_by_train:
        stops_by_train[tn].sort(key=lambda s: s["stop_sequence"])

    # Map (from, to) -> (section_dict, is_reverse)
    section_lookup: dict[tuple[str, str], tuple[dict, bool]] = {}
    for s in sections:
        f_st = s["from_station_code"]
        t_st = s["to_station_code"]
        section_lookup[(f_st, t_st)] = (s, False)
        section_lookup[(t_st, f_st)] = (s, True)

    # Map (from, to) -> list of block dicts
    blocks_by_sec: dict[tuple[str, str], list[dict]] = {}
    for b in blocks:
        key = (b["section_from"], b["section_to"])
        blocks_by_sec.setdefault(key, []).append(b)
    for key in blocks_by_sec:
        blocks_by_sec[key].sort(key=lambda b: b.get("block_index", 0))

    occupancy: dict[str, list[dict[str, Any]]] = {}

    for tr in trains:
        tn = tr["train_number"]
        direction = tr.get("direction", "up").upper()
        stops = stops_by_train.get(tn, [])
        if len(stops) < 2:
            continue

        for i in range(len(stops) - 1):
            cur = stops[i]
            nxt = stops[i + 1]
            from_st = cur["station_code"]
            to_st = nxt["station_code"]

            dep_min = cur.get("revised_departure_min")
            if dep_min is None:
                dep_min = cur.get("planned_departure_min")
            if dep_min is None:
                continue

            sec_info = section_lookup.get((from_st, to_st))
            if not sec_info:
                continue
            sec, is_reversed = sec_info
            rt = sec.get("running_time_min", 60)
            is_dt = sec.get("is_double_track", False)

            canonical_sec = (sec["from_station_code"], sec["to_station_code"])
            blks = list(blocks_by_sec.get(canonical_sec, []))
            if not blks:
                continue
            if is_reversed:
                blks = list(reversed(blks))

            curr_t = dep_min
            cum_traverse = 0
            for idx_b, b in enumerate(blks):
                if idx_b == len(blks) - 1:
                    dur = max(1, rt - cum_traverse)
                else:
                    tf = b.get("time_fraction", 1.0 / len(blks))
                    dur = max(1, round(rt * tf))
                cum_traverse += dur
                raw_code = b["code"]
                # Directional key on double track, shared physical key on single track
                blk_key = raw_code if not is_dt else f"{raw_code}-{direction}"

                win = {
                    "train_number": tn,
                    "direction": direction,
                    "entry_min": curr_t,
                    "exit_min": curr_t + dur,
                    "block_code": raw_code,
                    "resource_key": blk_key,
                    "is_double_track": is_dt,
                }
                occupancy.setdefault(blk_key, []).append(win)
                curr_t += dur

    for k in occupancy:
        occupancy[k].sort(key=lambda w: w["entry_min"])

    return occupancy


def verify_block_reservation_overlaps(
    occupancy: dict[str, list[dict[str, Any]]],
) -> list[VerificationViolation]:
    """Verify Rule 1: No two trains simultaneously occupy the same exclusive block."""
    violations: list[VerificationViolation] = []

    for blk_key, windows in occupancy.items():
        is_dt = any(w["is_double_track"] for w in windows)
        for i in range(len(windows)):
            w1 = windows[i]
            for j in range(i + 1, len(windows)):
                w2 = windows[j]
                if not _intervals_overlap(w1["entry_min"], w1["exit_min"], w2["entry_min"], w2["exit_min"]):
                    if w2["entry_min"] >= w1["exit_min"]:
                        break
                    continue

                # On double track, same-direction trains on the same line are caught by headway
                if is_dt and w1["direction"] == w2["direction"]:
                    continue

                violations.append(
                    VerificationViolation(
                        violation_type=ViolationType.RESERVATION_OVERLAP,
                        severity=ViolationSeverity.CRITICAL,
                        resource_code=w1["block_code"],
                        trains=(w1["train_number"], w2["train_number"]),
                        start_min=max(w1["entry_min"], w2["entry_min"]),
                        end_min=min(w1["exit_min"], w2["exit_min"]),
                        details=(
                            f"Exclusive block {w1['block_code']} occupied concurrently by "
                            f"{w1['train_number']} ({w1['entry_min']}-{w1['exit_min']}) and "
                            f"{w2['train_number']} ({w2['entry_min']}-{w2['exit_min']})."
                        ),
                    )
                )

    return violations


def verify_headway_separation(
    occupancy: dict[str, list[dict[str, Any]]],
    sections: list[dict],
    blocks: list[dict],
) -> list[VerificationViolation]:
    """Verify Rule 2: Consecutive same-direction trains satisfy minimum headway."""
    violations: list[VerificationViolation] = []

    # Map block_code -> section headway
    block_hw_map: dict[str, int] = {}
    for b in blocks:
        sf = b.get("section_from")
        st = b.get("section_to")
        for s in sections:
            if (s["from_station_code"], s["to_station_code"]) in [(sf, st), (st, sf)]:
                block_hw_map[b["code"]] = s.get("headway_min", 5)
                break

    for blk_key, windows in occupancy.items():
        by_dir: dict[str, list[dict[str, Any]]] = {}
        for w in windows:
            by_dir.setdefault(w["direction"], []).append(w)

        for dirn, dir_wins in by_dir.items():
            dir_wins.sort(key=lambda w: w["entry_min"])
            for i in range(len(dir_wins) - 1):
                w1 = dir_wins[i]
                w2 = dir_wins[i + 1]
                gap = w2["entry_min"] - w1["entry_min"]
                min_hw = block_hw_map.get(w1["block_code"], 5)
                if gap < min_hw:
                    violations.append(
                        VerificationViolation(
                            violation_type=ViolationType.HEADWAY_VIOLATION,
                            severity=ViolationSeverity.HIGH,
                            resource_code=w1["block_code"],
                            trains=(w1["train_number"], w2["train_number"]),
                            start_min=w1["entry_min"],
                            end_min=w2["entry_min"],
                            details=(
                                f"Headway violation on block {w1['block_code']}: {w2['train_number']} "
                                f"entered only {gap} min after {w1['train_number']} (minimum: {min_hw} min)."
                            ),
                        )
                    )

    return violations


def verify_opposing_movements(
    trains: list[dict],
    stop_times: list[dict],
    sections: list[dict],
) -> list[VerificationViolation]:
    """Verify Rule 3: No opposing trains concurrently inside a single-track section."""
    violations: list[VerificationViolation] = []

    stops_by_train: dict[str, list[dict]] = {}
    for st in stop_times:
        stops_by_train.setdefault(st["train_number"], []).append(st)
    for tn in stops_by_train:
        stops_by_train[tn].sort(key=lambda s: s["stop_sequence"])

    single_track_secs = {
        tuple(sorted([s["from_station_code"], s["to_station_code"]])): s
        for s in sections
        if not s.get("is_double_track", False)
    }

    # Collect section traversals: canonical_sec -> list of {tn, from_st, to_st, dep, arr}
    traversals: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for tr in trains:
        tn = tr["train_number"]
        stops = stops_by_train.get(tn, [])
        for i in range(len(stops) - 1):
            s_from = stops[i]["station_code"]
            s_to = stops[i + 1]["station_code"]
            canon = tuple(sorted([s_from, s_to]))
            if canon in single_track_secs:
                dep = stops[i].get("revised_departure_min") or stops[i].get("planned_departure_min")
                arr = stops[i + 1].get("revised_arrival_min") or stops[i + 1].get("planned_arrival_min")
                if dep is not None and arr is not None:
                    traversals.setdefault(canon, []).append({
                        "tn": tn,
                        "from_st": s_from,
                        "to_st": s_to,
                        "dep": dep,
                        "arr": arr,
                    })

    for canon, trav_list in traversals.items():
        for i in range(len(trav_list)):
            t1 = trav_list[i]
            for j in range(i + 1, len(trav_list)):
                t2 = trav_list[j]
                # Opposite directions
                if t1["from_st"] == t2["to_st"] and t1["to_st"] == t2["from_st"]:
                    if _intervals_overlap(t1["dep"], t1["arr"], t2["dep"], t2["arr"]):
                        violations.append(
                            VerificationViolation(
                                violation_type=ViolationType.OPPOSING_MOVEMENT,
                                severity=ViolationSeverity.CRITICAL,
                                resource_code=f"{canon[0]}-{canon[1]}",
                                trains=(t1["tn"], t2["tn"]),
                                start_min=max(t1["dep"], t2["dep"]),
                                end_min=min(t1["arr"], t2["arr"]),
                                details=(
                                    f"Deadlock opposing movement on single-track section {canon[0]}-{canon[1]}: "
                                    f"Train {t1['tn']} ({t1['from_st']}->{t1['to_st']}, {t1['dep']}-{t1['arr']}) "
                                    f"overlaps with {t2['tn']} ({t2['from_st']}->{t2['to_st']}, {t2['dep']}-{t2['arr']})."
                                ),
                            )
                        )

    return violations


def verify_maintenance_closures(
    occupancy: dict[str, list[dict[str, Any]]],
    closed_windows: list[dict[str, Any]],
) -> list[VerificationViolation]:
    """Verify Rule 4: No train scheduled on closed blocks during maintenance windows."""
    violations: list[VerificationViolation] = []

    for cw in closed_windows:
        b_code = cw["block_code"]
        c_start = cw.get("start_min", 0)
        c_end = cw.get("end_min", 1440)

        # Match single or double-track keys
        for key, wins in occupancy.items():
            if key == b_code or key.startswith(f"{b_code}-"):
                for w in wins:
                    if _intervals_overlap(w["entry_min"], w["exit_min"], c_start, c_end):
                        violations.append(
                            VerificationViolation(
                                violation_type=ViolationType.CLOSURE_VIOLATION,
                                severity=ViolationSeverity.CRITICAL,
                                resource_code=b_code,
                                trains=(w["train_number"],),
                                start_min=max(w["entry_min"], c_start),
                                end_min=min(w["exit_min"], c_end),
                                details=(
                                    f"Train {w['train_number']} traverses block {b_code} during active maintenance "
                                    f"closure ({c_start}-{c_end} min)."
                                ),
                            )
                        )

    return violations


def verify_station_capacity(
    trains: list[dict],
    stop_times: list[dict],
    stations: list[dict],
) -> list[VerificationViolation]:
    """Verify Rule 5: Station platform and passing loop capacity not exceeded."""
    violations: list[VerificationViolation] = []

    station_cap_map = {
        s["code"]: max(1, s.get("platform_count", 1) + (1 if s.get("has_passing_loop", False) else 0))
        for s in stations
    }

    # Group station dwells
    dwells_by_stn: dict[str, list[dict[str, Any]]] = {}
    stops_by_train: dict[str, list[dict]] = {}
    for st in stop_times:
        stops_by_train.setdefault(st["train_number"], []).append(st)
    for tn in stops_by_train:
        stops_by_train[tn].sort(key=lambda s: s["stop_sequence"])

    for tr in trains:
        tn = tr["train_number"]
        stops = stops_by_train.get(tn, [])
        for i, s in enumerate(stops):
            stn = s["station_code"]
            arr = s.get("revised_arrival_min") or s.get("planned_arrival_min")
            dep = s.get("revised_departure_min") or s.get("planned_departure_min")
            dwell = max(1, s.get("dwell_min", 2))

            if arr is None and dep is None:
                continue

            if 0 < i < len(stops) - 1:
                start_t = arr if arr is not None else dep - dwell
                end_t = dep if dep is not None else arr + dwell
            elif i == 0:
                end_t = dep or (arr + dwell if arr else 0)
                start_t = max(0, end_t - dwell)
            else:
                start_t = arr or (dep - dwell if dep else 0)
                end_t = start_t + dwell

            if end_t > start_t:
                dwells_by_stn.setdefault(stn, []).append({
                    "tn": tn,
                    "start": start_t,
                    "end": end_t,
                })

    for stn_code, intervals in dwells_by_stn.items():
        cap = station_cap_map.get(stn_code, 1)
        # Event point sweep
        events: list[tuple[int, int, str]] = []
        for iv in intervals:
            events.append((iv["start"], 1, iv["tn"]))
            events.append((iv["end"], -1, iv["tn"]))
        events.sort(key=lambda e: (e[0], e[1]))

        current_trains: set[str] = set()
        for t, delta, tn in events:
            if delta == 1:
                current_trains.add(tn)
                if len(current_trains) > cap:
                    violations.append(
                        VerificationViolation(
                            violation_type=ViolationType.STATION_CAPACITY_EXCEEDED,
                            severity=ViolationSeverity.HIGH,
                            resource_code=stn_code,
                            trains=tuple(sorted(current_trains)),
                            start_min=t,
                            end_min=t,
                            details=(
                                f"Station {stn_code} capacity exceeded at {t} min: "
                                f"{len(current_trains)} trains present simultaneously (capacity: {cap})."
                            ),
                        )
                    )
            else:
                current_trains.discard(tn)

    return violations


def verify_schedule_integrity(
    trains: list[dict],
    stop_times: list[dict],
    sections: list[dict],
    blocks: list[dict],
    stations: list[dict],
    closed_windows: list[dict[str, Any]] | None = None,
) -> VerificationResult:
    """Run full suite of independent verification checks against schedule.

    Returns complete VerificationResult object with pass/fail breakdown.
    """
    if closed_windows is None:
        closed_windows = []

    occupancy = compute_independent_block_occupancies(trains, stop_times, sections, blocks)

    all_violations: list[VerificationViolation] = []
    checks_passed: list[str] = []
    checks_failed: list[str] = []

    # 1. Block reservation overlap
    v_overlap = verify_block_reservation_overlaps(occupancy)
    if v_overlap:
        all_violations.extend(v_overlap)
        checks_failed.append("block_reservation_overlap")
    else:
        checks_passed.append("block_reservation_overlap")

    # 2. Headway separation
    v_hw = verify_headway_separation(occupancy, sections, blocks)
    if v_hw:
        all_violations.extend(v_hw)
        checks_failed.append("headway_separation")
    else:
        checks_passed.append("headway_separation")

    # 3. Opposing movements
    v_opp = verify_opposing_movements(trains, stop_times, sections)
    if v_opp:
        all_violations.extend(v_opp)
        checks_failed.append("opposing_movement")
    else:
        checks_passed.append("opposing_movement")

    # 4. Maintenance closures
    v_maint = verify_maintenance_closures(occupancy, closed_windows)
    if v_maint:
        all_violations.extend(v_maint)
        checks_failed.append("maintenance_closure")
    else:
        checks_passed.append("maintenance_closure")

    # 5. Station capacity
    v_cap = verify_station_capacity(trains, stop_times, stations)
    if v_cap:
        all_violations.extend(v_cap)
        checks_failed.append("station_capacity")
    else:
        checks_passed.append("station_capacity")

    is_valid = len(all_violations) == 0

    metrics = {
        "trains_checked": len(trains),
        "blocks_checked": len(blocks),
        "sections_checked": len(sections),
        "stations_checked": len(stations),
        "closure_windows_checked": len(closed_windows),
        "total_occupancy_windows": sum(len(wins) for wins in occupancy.values()),
    }

    return VerificationResult(
        is_valid=is_valid,
        violation_count=len(all_violations),
        violations=all_violations,
        checks_passed=checks_passed,
        checks_failed=checks_failed,
        metrics=metrics,
    )
