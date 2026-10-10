"""Deterministic time-stepped railway simulator.

Pure Python — no FastAPI or SQLAlchemy imports.
All times are in minutes from midnight.
Seed-deterministic: set seed before calling step().
"""

from __future__ import annotations

import dataclasses
import enum
from typing import Optional


class TrainStatus(str, enum.Enum):
    WAITING = "waiting"       # not yet departed
    EN_ROUTE = "en_route"     # currently in a block
    AT_STATION = "at_station" # dwelling at a station
    ARRIVED = "arrived"       # reached final destination
    HELD = "held"             # held by conflict or signal


class BlockState(str, enum.Enum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    RESERVED = "reserved"
    CLOSED = "closed"         # maintenance
    CONFLICTED = "conflicted"


@dataclasses.dataclass
class BlockSimState:
    """Runtime state of one block during simulation."""

    code: str
    state: BlockState = BlockState.AVAILABLE
    # Train number currently in this block (None if free)
    current_train: Optional[str] = None
    # Expected entry time (minutes from midnight)
    reserved_entry_min: Optional[int] = None
    # Expected exit time (minutes from midnight)
    expected_exit_min: Optional[int] = None
    direction: Optional[str] = None   # "up" | "down"
    section_from: str = ""
    section_to: str = ""
    is_double_track: bool = False
    headway_min: int = 5
    block_index: int = 0
    time_fraction: float = 0.5


@dataclasses.dataclass
class TrainSimState:
    """Runtime state of one train during simulation."""

    train_number: str
    name: str
    direction: str
    priority: int
    status: TrainStatus = TrainStatus.WAITING
    # Index into the stop list
    current_stop_idx: int = 0
    # Delay accrued so far (minutes)
    delay_min: int = 0
    # Current block code (None if at station or not started)
    current_block: Optional[str] = None
    # Actual time departed first station (None until departed)
    actual_departure_min: Optional[int] = None
    # Actual time arrived final station
    actual_arrival_min: Optional[int] = None
    # Minutes until next event (dwell countdown or block traverse)
    countdown_min: int = 0


@dataclasses.dataclass
class SimulatorState:
    """Full snapshot of the simulator at a given simulation-time."""

    current_time_min: int = 0
    """Simulation clock in minutes from midnight."""
    is_running: bool = False
    speed_factor: float = 1.0
    """Steps per real second (for frontend display purposes only)."""
    trains: dict[str, TrainSimState] = dataclasses.field(default_factory=dict)
    blocks: dict[str, BlockSimState] = dataclasses.field(default_factory=dict)
    step_count: int = 0


class Simulator:
    """Deterministic minute-resolution railway simulator.

    Usage::

        sim = Simulator(network_data, timetable_data)
        sim.reset()
        for _ in range(60):
            sim.step()
        state = sim.get_state()
    """

    def __init__(
        self,
        stations: list[dict],
        sections: list[dict],
        blocks: list[dict],
        trains: list[dict],
        stop_times: list[dict],
    ) -> None:
        self._stations = {s["code"]: s for s in stations}
        self._sections = sections
        self._blocks_meta = {b["code"]: b for b in blocks}
        self._trains_meta = {t["train_number"]: t for t in trains}
        # stop_times: [{train_number, station_code, stop_sequence, planned_departure_min, planned_arrival_min, dwell_min}]
        self._stop_times: dict[str, list[dict]] = {}
        for st in stop_times:
            tn = st["train_number"]
            self._stop_times.setdefault(tn, []).append(st)
        for tn in self._stop_times:
            self._stop_times[tn].sort(key=lambda s: s["stop_sequence"])

        # Closed blocks (maintenance)
        self._closed_blocks: set[str] = set()
        # Current simulation state
        self._state = SimulatorState()

    # -----------------------------------------------------------------------
    # Control
    # -----------------------------------------------------------------------

    def reset(self, start_time_min: int = 0) -> None:
        """Reset to initial state at start_time_min."""
        self._state = SimulatorState(current_time_min=start_time_min)
        # Initialise block states
        for code, meta in self._blocks_meta.items():
            self._state.blocks[code] = BlockSimState(
                code=code,
                state=BlockState.CLOSED if code in self._closed_blocks else BlockState.AVAILABLE,
                section_from=meta.get("section_from", ""),
                section_to=meta.get("section_to", ""),
                is_double_track=meta.get("is_double_track", False),
                headway_min=meta.get("headway_min", 5),
                block_index=meta.get("block_index", 0),
                time_fraction=meta.get("time_fraction", 0.5),
            )
        # Initialise train states
        for tn, meta in self._trains_meta.items():
            self._state.trains[tn] = TrainSimState(
                train_number=tn,
                name=meta.get("name", tn),
                direction=meta.get("direction", "up"),
                priority=meta.get("priority", 5),
                status=TrainStatus.WAITING,
            )

    def start(self) -> None:
        self._state.is_running = True

    def pause(self) -> None:
        self._state.is_running = False

    def set_speed(self, factor: float) -> None:
        """Set simulation speed factor (>0)."""
        self._state.speed_factor = max(0.1, factor)

    def close_block(self, block_code: str) -> None:
        """Mark a block as closed (maintenance)."""
        self._closed_blocks.add(block_code)
        if block_code in self._state.blocks:
            self._state.blocks[block_code].state = BlockState.CLOSED

    def open_block(self, block_code: str) -> None:
        """Re-open a maintenance-closed block."""
        self._closed_blocks.discard(block_code)
        if block_code in self._state.blocks:
            if self._state.blocks[block_code].state == BlockState.CLOSED:
                self._state.blocks[block_code].state = BlockState.AVAILABLE

    # -----------------------------------------------------------------------
    # Simulation step
    # -----------------------------------------------------------------------

    def step(self) -> None:
        """Advance simulation by one minute."""
        t = self._state.current_time_min

        for tn, train in self._state.trains.items():
            stops = self._stop_times.get(tn, [])
            if not stops:
                continue
            self._tick_train(train, stops, t)

        self._state.current_time_min += 1
        self._state.step_count += 1

    def _tick_train(self, train: TrainSimState, stops: list[dict], t: int) -> None:
        """Advance one train by one minute."""
        if train.status == TrainStatus.ARRIVED:
            return

        if train.status == TrainStatus.WAITING:
            # Check if departure time has come
            first_stop = stops[0]
            dep = first_stop.get("planned_departure_min")
            if dep is not None and t >= dep + train.delay_min:
                train.status = TrainStatus.AT_STATION
                train.actual_departure_min = t
                train.current_stop_idx = 0

        elif train.status == TrainStatus.AT_STATION:
            stop = stops[train.current_stop_idx]
            dep = stop.get("planned_departure_min")
            if dep is None:
                # Final station
                train.status = TrainStatus.ARRIVED
                train.actual_arrival_min = t
                if train.current_block:
                    self._release_block(train.current_block, train.train_number)
                    train.current_block = None
                return
            if t >= dep + train.delay_min:
                # Start moving to next stop
                next_idx = train.current_stop_idx + 1
                if next_idx >= len(stops):
                    train.status = TrainStatus.ARRIVED
                    train.actual_arrival_min = t
                    return
                next_stop = stops[next_idx]
                # Compute blocks for this section
                from_code = stop["station_code"]
                to_code = next_stop["station_code"]
                blocks_on_section = self._blocks_for_section(from_code, to_code)
                if blocks_on_section:
                    first_block = blocks_on_section[0]
                    if self._can_enter_block(first_block, train):
                        self._enter_block(first_block, train, t)
                        train.status = TrainStatus.EN_ROUTE
                        train.current_stop_idx = next_idx
                    else:
                        train.status = TrainStatus.HELD
                else:
                    # No block data; jump directly
                    train.current_stop_idx = next_idx
                    train.status = TrainStatus.AT_STATION

        elif train.status == TrainStatus.EN_ROUTE:
            blk = self._state.blocks.get(train.current_block or "")
            if blk and blk.expected_exit_min is not None and t >= blk.expected_exit_min:
                self._release_block(blk.code, train.train_number)
                train.current_block = None
                train.status = TrainStatus.AT_STATION

        elif train.status == TrainStatus.HELD:
            # Retry entering the block
            stop = stops[train.current_stop_idx - 1] if train.current_stop_idx > 0 else stops[0]
            next_stop = stops[train.current_stop_idx]
            from_code = stop["station_code"]
            to_code = next_stop["station_code"]
            blocks_on_section = self._blocks_for_section(from_code, to_code)
            if blocks_on_section:
                first_block = blocks_on_section[0]
                if self._can_enter_block(first_block, train):
                    train.delay_min += 1  # accumulate hold delay
                    self._enter_block(first_block, train, t)
                    train.status = TrainStatus.EN_ROUTE
            else:
                train.status = TrainStatus.AT_STATION

    def _blocks_for_section(self, from_code: str, to_code: str) -> list[str]:
        """Return ordered block codes for a section."""
        result = [
            code for code, meta in self._blocks_meta.items()
            if meta.get("section_from") == from_code and meta.get("section_to") == to_code
        ]
        return sorted(result, key=lambda c: self._blocks_meta[c].get("block_index", 0))

    def _can_enter_block(self, block_code: str, train: TrainSimState) -> bool:
        """True if the train is allowed to enter the block."""
        blk = self._state.blocks.get(block_code)
        if blk is None:
            return True
        if blk.state in (BlockState.CLOSED,):
            return False
        if blk.state in (BlockState.OCCUPIED, BlockState.RESERVED):
            if not blk.is_double_track:
                return False
            # On double track, opposing trains can conflict — check direction
            if blk.direction and blk.direction != train.direction:
                return False
        return True

    def _enter_block(self, block_code: str, train: TrainSimState, t: int) -> None:
        blk = self._state.blocks.get(block_code)
        if blk is None:
            return
        meta = self._blocks_meta.get(block_code, {})
        # Estimate traversal time from section running time and time_fraction
        # We need the section running time; stored in meta via enrichment or default
        section_rt = meta.get("section_running_time_min", 30)
        traverse_min = max(1, round(section_rt * blk.time_fraction))
        blk.state = BlockState.OCCUPIED
        blk.current_train = train.train_number
        blk.reserved_entry_min = t
        blk.expected_exit_min = t + traverse_min
        blk.direction = train.direction
        train.current_block = block_code

    def _release_block(self, block_code: str, train_number: str) -> None:
        blk = self._state.blocks.get(block_code)
        if blk is None:
            return
        if blk.current_train == train_number:
            blk.state = BlockState.AVAILABLE
            blk.current_train = None
            blk.reserved_entry_min = None
            blk.expected_exit_min = None
            blk.direction = None

    # -----------------------------------------------------------------------
    # State access
    # -----------------------------------------------------------------------

    def get_state(self) -> SimulatorState:
        return self._state

    def get_state_dict(self) -> dict:
        """Serialisable snapshot of the full state."""
        trains_out = {}
        for tn, tr in self._state.trains.items():
            trains_out[tn] = {
                "train_number": tr.train_number,
                "name": tr.name,
                "direction": tr.direction,
                "priority": tr.priority,
                "status": tr.status.value,
                "current_stop_idx": tr.current_stop_idx,
                "delay_min": tr.delay_min,
                "current_block": tr.current_block,
                "actual_departure_min": tr.actual_departure_min,
                "actual_arrival_min": tr.actual_arrival_min,
            }
        blocks_out = {}
        for code, blk in self._state.blocks.items():
            blocks_out[code] = {
                "code": blk.code,
                "state": blk.state.value,
                "current_train": blk.current_train,
                "reserved_entry_min": blk.reserved_entry_min,
                "expected_exit_min": blk.expected_exit_min,
                "direction": blk.direction,
                "section_from": blk.section_from,
                "section_to": blk.section_to,
            }
        return {
            "current_time_min": self._state.current_time_min,
            "is_running": self._state.is_running,
            "speed_factor": self._state.speed_factor,
            "step_count": self._state.step_count,
            "trains": trains_out,
            "blocks": blocks_out,
        }
