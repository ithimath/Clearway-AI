"""Gymnasium environment for railway dispatch (requires gymnasium installed)."""

from __future__ import annotations

from typing import Any

import numpy as np

try:
    import gymnasium as gym
    from gymnasium import spaces
    GYM_AVAILABLE = True
except ImportError:
    GYM_AVAILABLE = False


if GYM_AVAILABLE:
    class RailwayDispatchEnv(gym.Env):
        """A simplified railway dispatch environment for RL experiments.

        State: [current_time_norm, n_waiting_trains, n_active_trains, n_conflicts,
                n_available_blocks, delay_sum_norm]  — shape (6,)
        Actions: 0=hold all, 1=dispatch next waiting train, 2=dispatch all ready
        Reward: -delay_per_step * 0.01 - conflict_count * 0.5 + dispatch_bonus
        Episode: 480 steps (8 hours of simulation)

        This is a toy abstraction to demonstrate RL integration.
        All infrastructure is ASSUMED.
        """

        metadata = {"render_modes": []}

        def __init__(self, seed: int = 42) -> None:
            super().__init__()
            self._seed = seed
            self.observation_space = spaces.Box(
                low=np.zeros(6, dtype=np.float32),
                high=np.ones(6, dtype=np.float32),
                dtype=np.float32,
            )
            self.action_space = spaces.Discrete(3)
            self._rng = np.random.default_rng(seed)
            self._t = 0
            self._waiting = 5
            self._active = 0
            self._conflicts = 0
            self._delay = 0.0
            self._blocks_avail = 20

        def reset(self, seed: int | None = None, options: dict | None = None) -> tuple[np.ndarray, dict]:
            if seed is not None:
                self._rng = np.random.default_rng(seed)
            self._t = 0
            self._waiting = int(self._rng.integers(3, 8))
            self._active = 0
            self._conflicts = 0
            self._delay = 0.0
            self._blocks_avail = 20
            return self._obs(), {}

        def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict]:
            self._t += 1
            reward = 0.0

            if action == 1 and self._waiting > 0 and self._blocks_avail > 0:
                self._waiting -= 1
                self._active += 1
                self._blocks_avail -= self._rng.integers(1, 3)
                reward += 0.5  # dispatch bonus

            elif action == 2 and self._waiting > 0:
                n = min(self._waiting, max(1, self._blocks_avail // 2))
                self._waiting -= n
                self._active += n
                self._blocks_avail -= n * self._rng.integers(1, 3)
                reward += 0.3 * n

            # Random completions
            completed = min(self._active, int(self._rng.integers(0, 2)))
            self._active -= completed
            self._blocks_avail = min(20, self._blocks_avail + completed * 2)

            # Random new arrivals
            new_arr = int(self._rng.integers(0, 2))
            self._waiting += new_arr

            # Delay accumulation
            self._delay += self._active * 0.5 + self._waiting * 0.2
            delay_this_step = self._active * 0.5 + self._waiting * 0.2
            reward -= delay_this_step * 0.01

            # Conflicts: happen when blocks over-committed
            if self._blocks_avail < 0:
                self._conflicts += 1
                self._blocks_avail = 0
                reward -= 0.5

            terminated = self._t >= 480
            return self._obs(), float(reward), terminated, False, {}

        def _obs(self) -> np.ndarray:
            return np.array([
                self._t / 480.0,
                min(self._waiting / 10.0, 1.0),
                min(self._active / 10.0, 1.0),
                min(self._conflicts / 20.0, 1.0),
                min(self._blocks_avail / 20.0, 1.0),
                min(self._delay / 500.0, 1.0),
            ], dtype=np.float32)

        def render(self) -> None:
            pass
else:
    class RailwayDispatchEnv:  # type: ignore[no-redef]
        """Stub when gymnasium is not installed."""

        def __init__(self, seed: int = 42) -> None:
            raise ImportError("gymnasium not installed. Run: pip install -r requirements-rl.txt")
