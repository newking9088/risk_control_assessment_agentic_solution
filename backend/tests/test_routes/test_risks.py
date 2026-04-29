import uuid
import pytest
from tests.conftest import TEST_TENANT_ID, TEST_USER_ID


async def _make_assessment(conn) -> str:
    aid = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Risk Test", TEST_USER_ID),
    )
    return aid


@pytest.mark.asyncio
async def test_add_and_list_risks(db_conn):
    aid = await _make_assessment(db_conn)
    rid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_risks (id, assessment_id, name, category, source) "
        "VALUES (%s, %s, %s, %s, %s)",
        (rid, aid, "Fraud Risk", "Financial", "EXT"),
    )
    cur = await db_conn.execute(
        "SELECT id, name, category, source FROM app.assessment_risks WHERE assessment_id = %s", (aid,)
    )
    rows = await cur.fetchall()
    assert len(rows) == 1
    assert rows[0]["name"] == "Fraud Risk"
    assert rows[0]["source"] == "EXT"


@pytest.mark.asyncio
async def test_patch_likelihood_impact(db_conn):
    aid = await _make_assessment(db_conn)
    rid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_risks (id, assessment_id, name, category, source) "
        "VALUES (%s, %s, %s, %s, %s)",
        (rid, aid, "Op Risk", "Operational", "INT"),
    )
    await db_conn.execute(
        "UPDATE app.assessment_risks SET inherent_likelihood = 'high', inherent_impact = 'critical' "
        "WHERE id = %s",
        (rid,),
    )
    cur = await db_conn.execute(
        "SELECT inherent_likelihood, inherent_impact FROM app.assessment_risks WHERE id = %s", (rid,)
    )
    row = await cur.fetchone()
    assert row["inherent_likelihood"] == "high"
    assert row["inherent_impact"] == "critical"


@pytest.mark.asyncio
async def test_delete_risk(db_conn):
    aid = await _make_assessment(db_conn)
    rid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_risks (id, assessment_id, name, category, source) "
        "VALUES (%s, %s, %s, %s, %s)",
        (rid, aid, "Del Risk", "Compliance", "EXT"),
    )
    await db_conn.execute("DELETE FROM app.assessment_risks WHERE id = %s", (rid,))
    cur = await db_conn.execute("SELECT id FROM app.assessment_risks WHERE id = %s", (rid,))
    assert await cur.fetchone() is None


# ── HTTP-level tests ──────────────────────────────────────────
class TestRisksHTTP:
    def _make_assessment(self, test_client) -> str:
        resp = test_client.post("/api/v1/assessments", json={"title": "Risk HTTP Test"})
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_create_risk(self, test_client):
        aid = self._make_assessment(test_client)
        resp = test_client.post(
            f"/api/v1/assessments/{aid}/risks",
            json={"name": "Test Risk", "category": "Fraud", "source": "EXT"},
        )
        assert resp.status_code == 201
        assert "id" in resp.json()

    def test_list_risks(self, test_client):
        aid = self._make_assessment(test_client)
        test_client.post(
            f"/api/v1/assessments/{aid}/risks",
            json={"name": "Listed Risk", "category": "Compliance", "source": "INT"},
        )
        resp = test_client.get(f"/api/v1/assessments/{aid}/risks")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_patch_risk(self, test_client):
        aid = self._make_assessment(test_client)
        create_resp = test_client.post(
            f"/api/v1/assessments/{aid}/risks",
            json={"name": "Patch Risk", "category": "Fraud", "source": "EXT"},
        )
        rid = create_resp.json()["id"]
        resp = test_client.patch(
            f"/api/v1/assessments/{aid}/risks/{rid}",
            json={"inherent_likelihood": "high"},
        )
        assert resp.status_code == 200

    def test_delete_risk(self, test_client):
        aid = self._make_assessment(test_client)
        create_resp = test_client.post(
            f"/api/v1/assessments/{aid}/risks",
            json={"name": "Delete Risk", "category": "Fraud", "source": "EXT"},
        )
        rid = create_resp.json()["id"]
        resp = test_client.delete(f"/api/v1/assessments/{aid}/risks/{rid}")
        assert resp.status_code == 204

    def test_list_risks_empty(self, test_client):
        aid = self._make_assessment(test_client)
        resp = test_client.get(f"/api/v1/assessments/{aid}/risks")
        assert resp.status_code == 200
        assert resp.json() == []
