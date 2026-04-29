"""Tests for GET /api/v1/assessments/{id} — detail / profile endpoint."""
import uuid


def test_get_assessment_returns_detail(test_client):
    create_resp = test_client.post("/api/v1/assessments", json={"title": "Profile Test"})
    assert create_resp.status_code == 201
    aid = create_resp.json()["id"]

    resp = test_client.get(f"/api/v1/assessments/{aid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Profile Test"
    assert data["id"] == aid


def test_get_nonexistent_assessment_returns_404(test_client):
    fake_id = str(uuid.uuid4())
    resp = test_client.get(f"/api/v1/assessments/{fake_id}")
    assert resp.status_code == 404


def test_get_assessment_contains_expected_fields(test_client):
    create_resp = test_client.post("/api/v1/assessments", json={"title": "Field Check"})
    aid = create_resp.json()["id"]

    resp = test_client.get(f"/api/v1/assessments/{aid}")
    data = resp.json()
    for field in ("id", "title", "status", "current_step", "created_at"):
        assert field in data, f"Missing field: {field}"


def test_get_assessment_default_status_is_draft(test_client):
    create_resp = test_client.post("/api/v1/assessments", json={"title": "Status Check"})
    aid = create_resp.json()["id"]

    resp = test_client.get(f"/api/v1/assessments/{aid}")
    assert resp.json()["status"] == "draft"
