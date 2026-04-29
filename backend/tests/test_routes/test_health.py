"""Tests for GET /api/health."""


def test_health_returns_200(test_client):
    resp = test_client.get("/api/health")
    assert resp.status_code == 200


def test_health_contains_api_status(test_client):
    resp = test_client.get("/api/health")
    data = resp.json()
    assert "api" in data
    assert data["api"] == "ok"


def test_health_contains_db_status(test_client):
    resp = test_client.get("/api/health")
    assert "db" in resp.json()


def test_health_contains_redis_status(test_client):
    resp = test_client.get("/api/health")
    assert "redis" in resp.json()
