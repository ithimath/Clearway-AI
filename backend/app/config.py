from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = (_BACKEND_DIR / "clearway.db").resolve().as_posix()


class Settings(BaseSettings):
    """All configurable values; defaults work for local dev without a .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = f"sqlite:///{_DEFAULT_DB_PATH}"

    # Seeding / reproducibility
    seed_random_seed: int = 42
    """Fixed seed used by the synthetic generator and CP-SAT solver."""

    # Network derivation
    blocks_per_section: int = 2
    """Number of blocks derived per station-to-station section (ASSUMED)."""

    corridor_name: str = "Chennai-Madurai"
    """Name of the Indian Railways corridor selected for demo."""

    # Solver
    cpsat_time_limit_s: float = 30.0
    """Maximum wall-clock seconds allowed for CP-SAT solves."""

    # Simulation
    sim_step_minutes: int = 1
    """Granularity of the time-stepped simulator (minutes)."""

    # Logging
    log_level: str = "INFO"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
