"""SQLAlchemy ORM models — all tables in one package.

Import order matters: models with FK targets must be imported before dependents.
This __init__ re-exports everything so ``import app.models`` registers all tables.
"""

from app.models.infrastructure import Block, Junction, PassingLoop, Station, TrackSection
from app.models.trains import StopTime, Train
from app.models.scenarios import Scenario
from app.models.maintenance import MaintenanceJob, MaintenancePlan
from app.models.conflicts import ConflictRecord
from app.models.jobs import BackgroundJob
from app.models.events import SystemEvent
from app.models.datasets import DatasetMeta
from app.models.sim_results import SimResult
from app.models.opt_results import OptResult

__all__ = [
    "Station",
    "TrackSection",
    "Block",
    "Junction",
    "PassingLoop",
    "Train",
    "StopTime",
    "Scenario",
    "MaintenanceJob",
    "MaintenancePlan",
    "ConflictRecord",
    "BackgroundJob",
    "SystemEvent",
    "DatasetMeta",
    "SimResult",
    "OptResult",
]
