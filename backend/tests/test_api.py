"""API integration tests for Clearway AI FastAPI endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_network():
    res = client.get("/api/network")
    assert res.status_code == 200
    data = res.json()
    assert "stations" in data
    assert "sections" in data
    assert "blocks" in data
    assert len(data["stations"]) > 0


def test_trains_and_blocks():
    res_tr = client.get("/api/trains")
    assert res_tr.status_code == 200
    trains = res_tr.json()
    assert isinstance(trains, list)
    assert len(trains) > 0

    res_blk = client.get("/api/blocks")
    assert res_blk.status_code == 200
    blocks = res_blk.json()
    assert isinstance(blocks, list)
    assert len(blocks) > 0


def test_conflicts_detection():
    res = client.post("/api/conflicts/detect")
    assert res.status_code == 200
    data = res.json()
    assert "conflicts" in data
    assert isinstance(data["conflicts"], list)


def test_simulation_endpoints():
    # Reset
    res_reset = client.post("/api/simulation/reset?start_time_min=360")
    assert res_reset.status_code == 200
    
    # State
    res_st = client.get("/api/simulation/state")
    assert res_st.status_code == 200
    st = res_st.json()
    assert st["current_time_min"] == 360

    # Step
    res_step = client.post("/api/simulation/step")
    assert res_step.status_code == 200
    st2 = res_step.json()
    assert st2["current_time_min"] == 361


def test_metrics_summary():
    res = client.get("/api/metrics")
    assert res.status_code == 200
    metrics = res.json()
    assert "trains" in metrics
    assert "blocks" in metrics
    assert "delays" in metrics
