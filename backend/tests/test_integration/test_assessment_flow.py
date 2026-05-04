"""Integration: full assessment lifecycle — create → risks → controls → residual → summary."""
import uuid
import pytest
from tests.conftest import TEST_TENANT_ID, TEST_USER_ID


@pytest.mark.asyncio
async def test_full_assessment_flow(db_conn):
    # 1. Create assessment
    aid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Integration Test Assessment", TEST_USER_ID),
    )

    # 2. Add risk
    rid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_risks (id, assessment_id, name, category, source) "
        "VALUES (%s, %s, %s, %s, %s)",
        (rid, aid, "Integration Risk", "Operational", "INT"),
    )

    # 3. Rate inherent risk
    await db_conn.execute(
        "UPDATE app.assessment_risks SET inherent_likelihood = 'high', inherent_impact = 'critical' "
        "WHERE id = %s",
        (rid,),
    )

    # 4. Add control
    cid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessment_controls (id, assessment_id, risk_id, name, type) "
        "VALUES (%s, %s, %s, %s, %s)",
        (cid, aid, rid, "Integration Control", "Preventive"),
    )

    # 5. Rate control effectiveness
    await db_conn.execute(
        "UPDATE app.assessment_controls SET design_effectiveness = 2, operating_effectiveness = 2, "
        "overall_effectiveness = 'Moderately Effective' WHERE id = %s",
        (cid,),
    )

    # 6. Verify summary state
    cur = await db_conn.execute(
        "SELECT ar.inherent_likelihood, ar.inherent_impact, ac.overall_effectiveness "
        "FROM app.assessment_risks ar "
        "JOIN app.assessment_controls ac ON ac.risk_id = ar.id "
        "WHERE ar.assessment_id = %s",
        (aid,),
    )
    row = await cur.fetchone()
    assert row["inherent_likelihood"] == "high"
    assert row["inherent_impact"] == "critical"
    assert row["overall_effectiveness"] == "Moderately Effective"
