"""Integration: RLS tenant isolation — user A cannot see user B's data."""

import uuid

import pytest

from tests.conftest import TEST_TENANT_ID, TEST_USER_ID

OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000002"


@pytest.mark.asyncio
async def test_tenant_cannot_read_other_tenant_assessment(db_conn):
    # Insert assessment under the test tenant (as the privileged CI user)
    aid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Tenant A Assessment", TEST_USER_ID),
    )

    # In CI the connecting role (POSTGRES_USER) is a superuser and bypasses RLS.
    # We switch to the permanent `rls_tester` role (created by migration
    # 017_rls_tester_role.sql, committed before tests run) which is a
    # non-superuser, non-owner role subject to the tenant_isolation policy.
    # Creating a role inside this transaction does not work: PostgreSQL evaluates
    # SET ROLE against the committed catalog, not uncommitted DDL.
    await db_conn.execute("SET LOCAL ROLE rls_tester")
    await db_conn.execute(
        "SELECT set_config('app.current_tenant_id', %s, true)", (OTHER_TENANT_ID,)
    )

    # Should not be visible: tenant_id = TEST_TENANT_ID ≠ current_tenant_id = OTHER_TENANT_ID
    cur = await db_conn.execute("SELECT id FROM app.assessments WHERE id = %s", (aid,))
    row = await cur.fetchone()
    assert row is None, "RLS should prevent cross-tenant reads"

    # Revert role so the conftest rollback runs as the original privileged user
    await db_conn.execute("RESET ROLE")
