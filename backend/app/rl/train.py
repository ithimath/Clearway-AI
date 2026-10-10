"""RL training entry point (requires requirements-rl.txt installed)."""

from __future__ import annotations

from typing import Callable


def train_rl_agent(
    total_timesteps: int = 10000,
    seed: int = 42,
    progress_cb: Callable[[float], None] | None = None,
) -> None:
    """Train a PPO agent on the railway dispatch environment.

    Args:
        total_timesteps: Total environment steps to train.
        seed:            Random seed for reproducibility.
        progress_cb:     Optional callback with progress 0.0–1.0.
    """
    try:
        from stable_baselines3 import PPO
    except ImportError as exc:
        raise ImportError(
            "stable-baselines3 not installed. Run: pip install -r requirements-rl.txt"
        ) from exc

    from app.rl.env import RailwayDispatchEnv

    env = RailwayDispatchEnv(seed=seed)
    model = PPO("MlpPolicy", env, verbose=0, seed=seed)

    steps_done = 0
    batch = max(1, total_timesteps // 10)
    while steps_done < total_timesteps:
        this_batch = min(batch, total_timesteps - steps_done)
        model.learn(total_timesteps=this_batch, reset_num_timesteps=(steps_done == 0))
        steps_done += this_batch
        if progress_cb:
            progress_cb(steps_done / total_timesteps)

    model.save("backend/rl_model")
    env.close()
