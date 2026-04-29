"""Integration: RLS tenant isolation — user A cannot see user B's data."""
import uuid
import pytest
from tests.conftest import TEST_TENANT_ID, TEST_USER_ID

OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000002"


@pytest.mark.asyncio
async def test_tenant_cannot_read_other_tenant_assessment(db_conn):
    # Insert assessment under the test tenant
    aid = str(uuid.uuid4())
    await db_conn.execute(
        "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
        (aid, TEST_TENANT_ID, "Tenant A Assessment", TEST_USER_ID),
    )

    # Switch context to a different tenant
    await db_conn.execute(
        "SELECT set_config('app.current_tenant_id', %s, true)", (OTHER_TENANT_ID,)
    )

    # Should not be visible under other tenant context (RLS filters by tenant_id)
    cur = await db_conn.execute(
        "SELECT id FROM app.assessments WHERE id = %s", (aid,)
    )
    row = await cur.fetchone()
    assert row is None, "RLS should prevent cross-tenant reads"

    # Restore original tenant context for cleanup
    await db_conn.execute(
        "SELECT set_config('app.current_tenant_id', %s, true)", (TEST_TENANT_ID,)
    )
