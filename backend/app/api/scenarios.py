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


class ScenarioCreate(BaseModel):
    name: str
    description: str = ""
    scenario_type: str  # delay | closure | extended_runtime | junction_unavailable | priority_change | loop_removed
    parameters: dict


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
    scenario = Scenario(
        name=req.name,
        description=req.description,
        scenario_type=req.scenario_type,
        parameters_json=json.dumps(req.parameters),
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


@router.get("/{scenario_id}/compare")
def compare_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    """Return baseline vs scenario comparison metrics."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.result_json is None:
        raise HTTPException(status_code=409, detail="Scenario has not been run yet")

    return json.loads(scenario.result_json)
