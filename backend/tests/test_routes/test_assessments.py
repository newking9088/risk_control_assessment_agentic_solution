import uuid
import pytest
from tests.conftest import TEST_TENANT_ID, TEST_USER_ID


@pytest.mark.asyncio
async def test_create_and_list(db_conn):
    aid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Test Assessment", TEST_USER_ID),
    )
    cur = await db_conn.execute(
        "SELECT id, title, status, current_step FROM app.assessments WHERE id = %s", (aid,)
    )
    row = await cur.fetchone()
    assert row["title"] == "Test Assessment"
    assert row["status"] == "draft"
    assert row["current_step"] == 1


@pytest.mark.asyncio
async def test_patch(db_conn):
    aid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Patch Test", TEST_USER_ID),
    )
    await db_conn.execute(
        "UPDATE app.assessments SET current_step = 3, status = 'in_progress' WHERE id = %s", (aid,)
    )
    cur = await db_conn.execute(
        "SELECT current_step, status FROM app.assessments WHERE id = %s", (aid,)
    )
    row = await cur.fetchone()
    assert row["current_step"] == 3
    assert row["status"] == "in_progress"


@pytest.mark.asyncio
async def test_soft_delete(db_conn):
    aid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Delete Test", TEST_USER_ID),
    )
    await db_conn.execute(
        "UPDATE app.assessments SET status = 'archived' WHERE id = %s", (aid,)
    )
    cur = await db_conn.execute(
        "SELECT status FROM app.assessments WHERE id = %s", (aid,)
    )
    row = await cur.fetchone()
    assert row["status"] == "archived"


# ── HTTP-level tests ──────────────────────────────────────────
import uuid as _uuid


class TestAssessmentsHTTP:
    def test_create_returns_201(self, test_client):
        resp = test_client.post("/api/v1/assessments", json={"title": "HTTP Test"})
        assert resp.status_code == 201
        assert "id" in resp.json()

    def test_list_returns_200(self, test_client):
        test_client.post("/api/v1/assessments", json={"title": "List Test"})
        resp = test_client.get("/api/v1/assessments")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_by_id(self, test_client):
        create_resp = test_client.post("/api/v1/assessments", json={"title": "Get By ID"})
        aid = create_resp.json()["id"]
        resp = test_client.get(f"/api/v1/assessments/{aid}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Get By ID"

    def test_patch_status(self, test_client):
        create_resp = test_client.post("/api/v1/assessments", json={"title": "Patch Status"})
        aid = create_resp.json()["id"]
        test_client.patch(f"/api/v1/assessments/{aid}", json={"status": "in_progress"})
        resp = test_client.get(f"/api/v1/assessments/{aid}")
        assert resp.json()["status"] == "in_progress"

    def test_delete_returns_204(self, test_client):
        create_resp = test_client.post("/api/v1/assessments", json={"title": "Delete Test HTTP"})
        aid = create_resp.json()["id"]
        resp = test_client.delete(f"/api/v1/assessments/{aid}")
        assert resp.status_code == 204

    def test_get_nonexistent_returns_404(self, test_client):
        resp = test_client.get(f"/api/v1/assessments/{_uuid.uuid4()}")
        assert resp.status_code == 404
