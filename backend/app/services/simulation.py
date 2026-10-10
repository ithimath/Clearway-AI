"""Simulation state manager — singleton service holding the live simulator instance.

The simulator runs in the main process; step() is called per API request or
by the polling mechanism. Thread safety: a single threading.Lock guards state.
"""

from __future__ import annotations

import threading
from typing import Optional

from app.domain.simulator import Simulator


class SimulationService:
    """Singleton service wrapping the Simulator with thread-safe access."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sim: Optional[Simulator] = None
        self._initialized = False

    def initialize(
        self,
        stations: list[dict],
        sections: list[dict],
        blocks: list[dict],
        trains: list[dict],
        stop_times: list[dict],
    ) -> None:
        """Build the simulator from DB data and reset to t=0."""
        # Enrich blocks with section running time for traversal calculation
        section_rt = {
            (s["from_station_code"], s["to_station_code"]): s["running_time_min"]
            for s in sections
        }
        section_dt = {
            (s["from_station_code"], s["to_station_code"]): s.get("is_double_track", False)
            for s in sections
        }
        section_hw = {
            (s["from_station_code"], s["to_station_code"]): s.get("headway_min", 5)
            for s in sections
        }
        enriched_blocks = []
        for blk in blocks:
            key = (blk["section_from"], blk["section_to"])
            enriched = dict(blk)
            enriched["section_running_time_min"] = section_rt.get(key, 30)
            enriched["is_double_track"] = section_dt.get(key, False)
            enriched["headway_min"] = section_hw.get(key, 5)
            enriched_blocks.append(enriched)

        with self._lock:
            self._sim = Simulator(stations, sections, enriched_blocks, trains, stop_times)
            self._sim.reset()
            self._initialized = True

    def is_initialized(self) -> bool:
        return self._initialized

    def start(self) -> None:
        with self._lock:
            if self._sim:
                self._sim.start()

    def pause(self) -> None:
        with self._lock:
            if self._sim:
                self._sim.pause()

    def reset(self, start_time_min: int = 0) -> None:
        with self._lock:
            if self._sim:
                self._sim.reset(start_time_min=start_time_min)

    def step(self, steps: int = 1) -> None:
        with self._lock:
            if self._sim:
                for _ in range(steps):
                    self._sim.step()

    def set_speed(self, factor: float) -> None:
        with self._lock:
            if self._sim:
                self._sim.set_speed(factor)

    def close_block(self, block_code: str) -> None:
        with self._lock:
            if self._sim:
                self._sim.close_block(block_code)

    def open_block(self, block_code: str) -> None:
        with self._lock:
            if self._sim:
                self._sim.open_block(block_code)

    def get_state_dict(self) -> dict:
        with self._lock:
            if self._sim is None:
                return {"initialized": False}
            return {**self._sim.get_state_dict(), "initialized": True}


# Global singleton — imported by API routers
simulation_service = SimulationService()
