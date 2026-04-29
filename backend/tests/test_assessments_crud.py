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
