"""Tests for FastAPI backend REST endpoints and WebSocket protocol."""

import pytest
from fastapi.testclient import TestClient

from app.main import app, trainer
from app.config import MAZE_PRESET_NAMES


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["app"] == "WatchItLearn"


def test_maze_endpoint(client):
    res = client.get("/api/maze")
    assert res.status_code == 200
    data = res.json()
    assert "grid" in data
    assert "optimal_len" in data
    assert len(data["presets"]) == len(MAZE_PRESET_NAMES)


def test_recorded_run_endpoint(client):
    res = client.get("/api/recorded-run")
    assert res.status_code == 200
    frames = res.json()
    assert isinstance(frames, list)
    assert len(frames) > 0


def test_recorded_report_endpoint(client):
    res = client.get("/api/recorded-report")
    assert res.status_code == 200
    report = res.json()
    assert "verdict" in report
    assert "curves" in report
    assert "knowledge" in report


def test_report_endpoint_409_when_idle(client):
    # If trainer has not solved a run in this session
    trainer.frozen_snapshot = None
    res = client.get("/api/report")
    assert res.status_code == 409
    assert "No solved run available" in res.json()["message"]


def test_report_endpoint_200_when_snapshot_available(client):
    from app.env import MazeWorld
    from app.evaluation import TrainingSnapshot
    import numpy as np

    env = MazeWorld()
    q_table = np.zeros((121, 4), dtype=np.float32)
    episode_log = [{
        'index': 0,
        'steps': 32,
        'reached_goal': True,
        'return': 1.0,
        'wall_bumps': 0,
        'epsilon_at_start': 0.02,
        'cumulative_transitions': 32,
        'converged': True,
    }]
    visit_counts = np.zeros(121, dtype=np.int32)
    trainer.frozen_snapshot = TrainingSnapshot(
        env=env,
        q_table=q_table,
        episode_log=episode_log,
        visit_counts=visit_counts,
        maze_index=0,
        seed=42,
        speed_mode='normal',
    )

    res = client.get("/api/report")
    assert res.status_code == 200
    data = res.json()
    assert data["verdict"]["status"] in ("optimal", "near_optimal", "suboptimal", "failed")
    assert data["meta"]["maze_index"] == 0
