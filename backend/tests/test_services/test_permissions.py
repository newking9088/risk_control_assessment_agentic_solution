"""Tests for role-based access control via require_minimum_role."""
from fastapi.testclient import TestClient


def _make_client(role: str) -> TestClient:
    from app.main import app
    from app.middleware.auth import get_current_user

    async def _mock_user():
        return {
            "id": "test-user-001",
            "name": "Test User",
            "email": "test@example.com",
            "role": role,
            "tenantId": "00000000-0000-0000-0000-000000000001",
        }

    app.dependency_overrides[get_current_user] = _mock_user
    client = TestClient(app, headers={"Origin": "http://localhost:3000"})
    return client


def test_viewer_can_access_assessments():
    client = _make_client("viewer")
    resp = client.get("/api/v1/assessments")
    assert resp.status_code == 200


def test_viewer_cannot_upload():
    client = _make_client("viewer")
    resp = client.post(
        "/api/v1/upload?assessment_id=00000000-0000-0000-0000-000000000001",
        files={"file": ("x.txt", b"x", "text/plain")},
    )
    assert resp.status_code == 403


def test_analyst_can_access_assessments():
    client = _make_client("analyst")
    resp = client.get("/api/v1/assessments")
    assert resp.status_code == 200


def test_analyst_cannot_access_admin():
    client = _make_client("analyst")
    resp = client.get("/api/v1/admin/users")
    assert resp.status_code == 403


def test_delivery_lead_can_access_admin():
    client = _make_client("delivery_lead")
    resp = client.get("/api/v1/admin/users")
    assert resp.status_code == 200


def test_delivery_lead_can_upload():
    client = _make_client("delivery_lead")
    # will fail on file type, not on permissions (400 not 403)
    resp = client.post(
        "/api/v1/upload?assessment_id=00000000-0000-0000-0000-000000000001",
        files={"file": ("x.txt", b"x", "text/plain")},
    )
    assert resp.status_code != 403
