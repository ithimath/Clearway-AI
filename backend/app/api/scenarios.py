"""Scenarios API router."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.scenarios import Scenario
from app.models.events import SystemEvent

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


from pydantic import BaseModel, Field


class ScenarioCreate(BaseModel):
    name: str
    description: str = ""
    scenario_type: str = "delay"  # delay | closure | extended_runtime | junction_unavailable | priority_change | loop_removed
    parameters: dict = Field(default_factory=dict)
    # Flat convenience fields from frontend sandbox
    delay_train_number: str | None = None
    delay_minutes: int | None = None
    block_to_close: str | None = None
    closure_duration_min: int | None = None


@router.get("")
def list_scenarios(db: Session = Depends(get_db)) -> list[dict]:
    scenarios = db.query(Scenario).order_by(Scenario.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "scenario_type": s.scenario_type,
            "parameters": json.loads(s.parameters_json),
            "status": s.status,
            "created_at": s.created_at.isoformat(),
        }
        for s in scenarios
    ]


@router.post("")
def create_scenario(req: ScenarioCreate, db: Session = Depends(get_db)) -> dict:
    params = dict(req.parameters)
    scenario_type = req.scenario_type or "delay"

    # Map flat fields if present
    if req.delay_train_number and req.delay_train_number != "none":
        params["train_number"] = req.delay_train_number
        params["delay_min"] = req.delay_minutes if req.delay_minutes is not None else 15
        scenario_type = "delay"
    if req.block_to_close and req.block_to_close != "none":
        params["block_code"] = req.block_to_close
        params["duration_min"] = req.closure_duration_min if req.closure_duration_min is not None else 60
        if not req.delay_train_number or req.delay_train_number == "none":
            scenario_type = "closure"

    scenario = Scenario(
        name=req.name,
        description=req.description,
        scenario_type=scenario_type,
        parameters_json=json.dumps(params),
        status="pending",
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return {"id": scenario.id, "status": scenario.status}


@router.post("/{scenario_id}/run")
def run_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    """Apply scenario parameters and detect conflicts."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    from app.services.scenario_runner import run_scenario_service
    result = run_scenario_service(db, scenario)
    return result


@router.post("/reset")
def reset_active_scenario(db: Session = Depends(get_db)) -> dict:
    """Reset all active scenario delays and closures, restoring baseline schedule."""
    from app.services.scenario_runner import reset_scenario_service
    return reset_scenario_service(db)


@router.post("/{scenario_id}/apply")
def apply_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    """Apply the evaluated scenario disruption to the live simulation timetable and network blocks."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    from app.services.scenario_runner import apply_scenario_service
    return apply_scenario_service(db, scenario)


@router.get("/{scenario_id}/compare")
def compare_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    """Return baseline vs scenario comparison metrics."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.result_json is None:
        raise HTTPException(status_code=409, detail="Scenario has not been run yet")

    return json.loads(scenario.result_json)
