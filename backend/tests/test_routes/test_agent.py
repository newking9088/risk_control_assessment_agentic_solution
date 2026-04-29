"""Tests for POST /api/v1/agent/risk-applicability."""
from unittest.mock import patch


def _make_assessment(test_client) -> str:
    resp = test_client.post("/api/v1/assessments", json={"title": "Agent Test"})
    assert resp.status_code == 201
    return resp.json()["id"]


def test_risk_applicability_returns_risks(test_client):
    aid = _make_assessment(test_client)
    mock_result = {
        "risks": [
            {"name": "Fraud Risk", "category": "Fraud", "source": "EXT", "applicable": True}
        ]
    }
    with patch("app.routes.risks.respond_json", return_value=mock_result):
        resp = test_client.post(
            "/api/v1/agent/risk-applicability",
            json={"assessment_id": aid},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1


def test_risk_applicability_empty_result(test_client):
    aid = _make_assessment(test_client)
    with patch("app.routes.risks.respond_json", return_value={"risks": []}):
        resp = test_client.post(
            "/api/v1/agent/risk-applicability",
            json={"assessment_id": aid},
        )
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


def test_risk_applicability_only_inserts_applicable_risks(test_client):
    aid = _make_assessment(test_client)
    mock_result = {
        "risks": [
            {"name": "Applicable Risk", "category": "Fraud", "source": "EXT", "applicable": True},
            {"name": "Not Applicable", "category": "Compliance", "source": "INT", "applicable": False},
        ]
    }
    with patch("app.routes.risks.respond_json", return_value=mock_result):
        resp = test_client.post(
            "/api/v1/agent/risk-applicability",
            json={"assessment_id": aid},
        )
    assert resp.status_code == 200
    # count returns total risks in response, not only applicable ones
    assert resp.json()["count"] == 2
    # verify only 1 was inserted by listing risks
    list_resp = test_client.get(f"/api/v1/assessments/{aid}/risks")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
