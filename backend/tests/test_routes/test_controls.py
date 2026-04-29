import uuid
import pytest
from tests.conftest import TEST_TENANT_ID, TEST_USER_ID


async def _make_assessment(conn) -> str:
    aid = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Control Test", TEST_USER_ID),
    )
    return aid


async def _make_risk(conn, aid: str) -> str:
    rid = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO app.assessment_risks (id, assessment_id, name, category, source) "
        "VALUES (%s, %s, %s, %s, %s)",
        (rid, aid, "Base Risk", "Financial", "EXT"),
    )
    return rid


@pytest.mark.asyncio
async def test_add_and_list_controls(db_conn):
    aid = await _make_assessment(db_conn)
    rid = await _make_risk(db_conn, aid)
    cid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_controls (id, assessment_id, risk_id, name, type, is_key) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (cid, aid, rid, "Approval Control", "Preventive", True),
    )
    cur = await db_conn.execute(
        "SELECT id, name, type, is_key FROM app.assessment_controls WHERE assessment_id = %s", (aid,)
    )
    rows = await cur.fetchall()
    assert len(rows) == 1
    assert rows[0]["name"] == "Approval Control"
    assert rows[0]["is_key"] is True


@pytest.mark.asyncio
async def test_patch_effectiveness(db_conn):
    aid = await _make_assessment(db_conn)
    rid = await _make_risk(db_conn, aid)
    cid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_controls (id, assessment_id, risk_id, name) VALUES (%s, %s, %s, %s)",
        (cid, aid, rid, "Eff Control"),
    )
    await db_conn.execute(
        "UPDATE app.assessment_controls SET design_effectiveness = 3, operating_effectiveness = 4, "
        "overall_effectiveness = 'Effective' WHERE id = %s",
        (cid,),
    )
    cur = await db_conn.execute(
        "SELECT design_effectiveness, operating_effectiveness, overall_effectiveness "
        "FROM app.assessment_controls WHERE id = %s",
        (cid,),
    )
    row = await cur.fetchone()
    assert row["design_effectiveness"] == 3
    assert row["overall_effectiveness"] == "Effective"


@pytest.mark.asyncio
async def test_delete_control(db_conn):
    aid = await _make_assessment(db_conn)
    rid = await _make_risk(db_conn, aid)
    cid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_controls (id, assessment_id, risk_id, name) VALUES (%s, %s, %s, %s)",
        (cid, aid, rid, "Del Control"),
    )
    await db_conn.execute("DELETE FROM app.assessment_controls WHERE id = %s", (cid,))
    cur = await db_conn.execute("SELECT id FROM app.assessment_controls WHERE id = %s", (cid,))
    assert await cur.fetchone() is None


# ── HTTP-level tests ──────────────────────────────────────────
class TestControlsHTTP:
    def _make_assessment_and_risk(self, test_client) -> tuple[str, str]:
        a_resp = test_client.post("/api/v1/assessments", json={"title": "Control HTTP Test"})
        aid = a_resp.json()["id"]
        r_resp = test_client.post(
            f"/api/v1/assessments/{aid}/risks",
            json={"name": "Base Risk", "category": "Fraud", "source": "EXT"},
        )
        rid = r_resp.json()["id"]
        return aid, rid

    def test_create_control(self, test_client):
        aid, rid = self._make_assessment_and_risk(test_client)
        resp = test_client.post(
            f"/api/v1/assessments/{aid}/controls",
            json={"risk_id": rid, "name": "Test Control", "type": "Preventive", "is_key": False},
        )
        assert resp.status_code == 201
        assert "id" in resp.json()

    def test_list_controls(self, test_client):
        aid, rid = self._make_assessment_and_risk(test_client)
        test_client.post(
            f"/api/v1/assessments/{aid}/controls",
            json={"risk_id": rid, "name": "Listed Control", "type": "Detective", "is_key": True},
        )
        resp = test_client.get(f"/api/v1/assessments/{aid}/controls")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_patch_effectiveness(self, test_client):
        aid, rid = self._make_assessment_and_risk(test_client)
        create_resp = test_client.post(
            f"/api/v1/assessments/{aid}/controls",
            json={"risk_id": rid, "name": "Patch Control", "type": "Preventive", "is_key": False},
        )
        cid = create_resp.json()["id"]
        resp = test_client.patch(
            f"/api/v1/assessments/{aid}/controls/{cid}",
            json={"overall_effectiveness": "Effective"},
        )
        assert resp.status_code == 200

    def test_delete_control(self, test_client):
        aid, rid = self._make_assessment_and_risk(test_client)
        create_resp = test_client.post(
            f"/api/v1/assessments/{aid}/controls",
            json={"risk_id": rid, "name": "Delete Control", "type": "Preventive", "is_key": False},
        )
        cid = create_resp.json()["id"]
        resp = test_client.delete(f"/api/v1/assessments/{aid}/controls/{cid}")
        assert resp.status_code == 204
