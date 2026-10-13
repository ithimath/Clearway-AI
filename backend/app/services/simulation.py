"""Simulation state manager — singleton service holding the live simulator instance.

The simulator runs in the main process; step() is called per API request or
by the polling mechanism. Thread safety: a single threading.Lock guards state.
"""

from __future__ import annotations

import threading
import time
from typing import Optional

from app.domain.simulator import Simulator


class SimulationService:
    """Singleton service wrapping the Simulator with thread-safe access."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sim: Optional[Simulator] = None
        self._initialized = False
        self._ticker_thread: Optional[threading.Thread] = None
        self._stop_ticker = threading.Event()

    def _ensure_ticker_started(self) -> None:
        if self._ticker_thread is None or not self._ticker_thread.is_alive():
            self._stop_ticker.clear()
            self._ticker_thread = threading.Thread(target=self._ticker_loop, daemon=True)
            self._ticker_thread.start()

    def _ticker_loop(self) -> None:
        while not self._stop_ticker.is_set():
            speed = 1.0
            with self._lock:
                if self._sim and self._sim.get_state().is_running:
                    self._sim.step()
                    speed = max(0.1, self._sim.get_state().speed_factor)
            time.sleep(max(0.05, 1.0 / speed))

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
        self._ensure_ticker_started()

    def is_initialized(self) -> bool:
        return self._initialized

    def start(self) -> None:
        with self._lock:
            if self._sim:
                self._sim.start()
        self._ensure_ticker_started()

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
