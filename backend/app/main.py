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

app = FastAPI(
    title="Clearway AI — Railway Block Planning & Maintenance Window Optimizer",
    description=(
        "Academic/hackathon decision-support prototype. "
        "NOT a certified signalling or safety system. "
        "Do not use to control real trains."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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


@app.on_event("startup")
def on_startup() -> None:
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
