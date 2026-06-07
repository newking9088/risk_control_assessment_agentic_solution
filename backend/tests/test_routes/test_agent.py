"""Tests for POST /api/v1/agent/risk-applicability."""

from unittest.mock import AsyncMock, patch


def _make_assessment(test_client) -> str:
    resp = test_client.post("/api/v1/assessments", json={"title": "Agent Test"})
    assert resp.status_code == 201
    return resp.json()["id"]


def test_risk_applicability_returns_summary(test_client):
    aid = _make_assessment(test_client)
    mock_result = {
        "assessment_id": aid,
        "total": 1,
        "applicable": 1,
        "not_applicable": 0,
        "requires_review": 0,
    }
    with patch(
        "app.services.risk_applicability.process_applicability",
        new=AsyncMock(return_value=mock_result),
    ):
        resp = test_client.post(
            "/api/v1/agent/risk-applicability",
            json={"assessment_id": aid},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["applicable"] == 1


def test_risk_applicability_empty_result(test_client):
    aid = _make_assessment(test_client)
    mock_result = {
        "assessment_id": aid,
        "total": 0,
        "applicable": 0,
        "not_applicable": 0,
        "requires_review": 0,
    }
    with patch(
        "app.services.risk_applicability.process_applicability",
        new=AsyncMock(return_value=mock_result),
    ):
        resp = test_client.post(
            "/api/v1/agent/risk-applicability",
            json={"assessment_id": aid},
        )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


def test_risk_applicability_counts_not_applicable(test_client):
    aid = _make_assessment(test_client)
    mock_result = {
        "assessment_id": aid,
        "total": 2,
        "applicable": 1,
        "not_applicable": 1,
        "requires_review": 0,
    }
    with patch(
        "app.services.risk_applicability.process_applicability",
        new=AsyncMock(return_value=mock_result),
    ):
        resp = test_client.post(
            "/api/v1/agent/risk-applicability",
            json={"assessment_id": aid},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["applicable"] + data["not_applicable"] == data["total"]
