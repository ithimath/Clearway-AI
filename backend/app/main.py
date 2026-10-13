"""FastAPI application entrypoint for Clearway AI."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db, SessionLocal
from app.api import (
    health, network, trains, blocks, metrics,
    simulation, conflicts, optimize, maintenance,
    scenarios, jobs, rl, data, export,
)

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise DB tables and seed if empty."""
    logger.info("Starting Clearway AI backend…")
    init_db()
    db = SessionLocal()
    try:
        from app.services.seed import seed_database
        seed_database(db)
    finally:
        db.close()
    logger.info("Clearway AI backend ready.")
    yield


app = FastAPI(
    title="Clearway AI — Railway Block Planning & Maintenance Window Optimizer",
    description=(
        "Academic/hackathon decision-support prototype. "
        "NOT a certified signalling or safety system. "
        "Do not use to control real trains."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

from pathlib import Path
from fastapi.staticfiles import StaticFiles

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all API routers
for router_module in [
    health, network, trains, blocks, metrics,
    simulation, conflicts, optimize, maintenance,
    scenarios, jobs, rl, data, export,
]:
    app.include_router(router_module.router)

# Mount compiled frontend dist if available so http://127.0.0.1:8000 also serves the UI
_dist_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(_dist_dir), html=True), name="frontend")
