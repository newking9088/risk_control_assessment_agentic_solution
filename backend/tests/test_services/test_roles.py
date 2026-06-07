"""Tests for role hierarchy enforcement."""

from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.config.constants import ROLE_WEIGHTS


@contextmanager
def _make_client(role_or_user):
    from app.main import app
    from app.middleware.auth import get_current_user

    if isinstance(role_or_user, str):
        user = {
            "id": "test-user-001",
            "name": "Test User",
            "email": "test@example.com",
            "role": role_or_user,
            "tenantId": "00000000-0000-0000-0000-000000000001",
        }
    else:
        user = role_or_user

    async def _mock_user():
        return user

    app.dependency_overrides[get_current_user] = _mock_user
    with TestClient(app, headers={"Origin": "http://localhost:3000"}) as client:
        yield client
    app.dependency_overrides.pop(get_current_user, None)


def test_role_weight_ordering():
    assert ROLE_WEIGHTS["viewer"] < ROLE_WEIGHTS["analyst"] < ROLE_WEIGHTS["delivery_lead"]


def test_unknown_role_denied_analyst_route():
    with _make_client("superadmin") as client:
        resp = client.post(
            "/api/v1/upload?assessment_id=00000000-0000-0000-0000-000000000001",
            files={"file": ("x.txt", b"x", "text/plain")},
        )
    assert resp.status_code == 403


def test_missing_role_denied_analyst_route():
    user_without_role = {
        "id": "test-user-001",
        "name": "Test User",
        "email": "test@example.com",
        "tenantId": "00000000-0000-0000-0000-000000000001",
    }
    with _make_client(user_without_role) as client:
        resp = client.post(
            "/api/v1/upload?assessment_id=00000000-0000-0000-0000-000000000001",
            files={"file": ("x.txt", b"x", "text/plain")},
        )
    assert resp.status_code == 403


def test_viewer_weight_is_lowest():
    assert ROLE_WEIGHTS["viewer"] == 0


def test_admin_weight_is_highest():
    assert ROLE_WEIGHTS["admin"] == max(ROLE_WEIGHTS.values())
