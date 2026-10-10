"""RL evaluation — compare FCFS vs OR-Tools vs trained RL on identical seeds."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def evaluate_agents(db: Session) -> dict[str, Any]:
    """Evaluate all agents on the same seed environment.

    Returns honest comparison metrics. If RL is untrained, label it.
    """
    try:
        from stable_baselines3 import PPO
        from app.rl.env import RailwayDispatchEnv
    except ImportError:
        return {"error": "RL dependencies not installed."}

    import os
    model_path = "backend/rl_model.zip"
    if not os.path.exists(model_path):
        return {
            "model_trained": False,
            "message": "Untrained — train it to see results",
        }

    seed = 42
    results: dict[str, dict] = {}

    # FCFS baseline
    env = RailwayDispatchEnv(seed=seed)
    obs, _ = env.reset(seed=seed)
    done = False
    total_reward = 0.0
    steps = 0
    while not done and steps < 1000:
        action = 0  # FCFS: always dispatch first available
        obs, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
        total_reward += float(reward)
        steps += 1
    results["FCFS"] = {
        "total_reward": round(total_reward, 2),
        "steps": steps,
        "algorithm": "First-Come-First-Served (baseline)",
        "seed": seed,
    }
    env.close()

    # Trained RL
    env = RailwayDispatchEnv(seed=seed)
    model = PPO.load(model_path)
    obs, _ = env.reset(seed=seed)
    done = False
    total_reward_rl = 0.0
    steps_rl = 0
    while not done and steps_rl < 1000:
        action_arr, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, _ = env.step(int(action_arr))
        done = terminated or truncated
        total_reward_rl += float(reward)
        steps_rl += 1
    results["RL_PPO"] = {
        "total_reward": round(total_reward_rl, 2),
        "steps": steps_rl,
        "algorithm": "PPO (trained)",
        "seed": seed,
        "note": "Results measured on identical seed — DERIVED",
    }
    env.close()

    return {
        "model_trained": True,
        "seed": seed,
        "agents": results,
        "disclaimer": (
            "RL evaluation on ASSUMED synthetic environment. "
            "Results are DERIVED from simulation. "
            "Do not interpret as guarantees for real operations."
        ),
    }
