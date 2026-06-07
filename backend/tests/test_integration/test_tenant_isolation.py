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

    # In CI the connecting role (POSTGRES_USER) is a superuser, and PostgreSQL
    # superusers bypass RLS even when FORCE ROW LEVEL SECURITY is set.
    # We therefore test isolation by switching to a non-privileged role whose
    # queries ARE subject to the tenant_isolation policy.
    # All DDL here is inside the transaction that conftest rolls back on teardown.
    await db_conn.execute("DROP ROLE IF EXISTS _rls_tester")
    await db_conn.execute("CREATE ROLE _rls_tester NOLOGIN")
    await db_conn.execute("GRANT USAGE ON SCHEMA app TO _rls_tester")
    await db_conn.execute("GRANT SELECT ON app.assessments TO _rls_tester")

    # Switch to the restricted role and change tenant context
    await db_conn.execute("SET LOCAL ROLE _rls_tester")
    await db_conn.execute(
        "SELECT set_config('app.current_tenant_id', %s, true)", (OTHER_TENANT_ID,)
    )

    # Should not be visible: tenant_id = TEST_TENANT_ID ≠ current_tenant_id = OTHER_TENANT_ID
    cur = await db_conn.execute("SELECT id FROM app.assessments WHERE id = %s", (aid,))
    row = await cur.fetchone()
    assert row is None, "RLS should prevent cross-tenant reads"

    # Revert role so the conftest rollback runs as the original privileged user
    await db_conn.execute("RESET ROLE")
