import asyncio
import pytest
import psycopg
from psycopg.rows import dict_row

TEST_DB_URL = "postgresql://adminuser:adminuser_local_pw@localhost:5432/appdb"
TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001"
TEST_USER_ID = "00000000-0000-0000-0000-000000000099"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db_conn():
    conn = await psycopg.AsyncConnection.connect(TEST_DB_URL, row_factory=dict_row, autocommit=False)
    await conn.execute("SELECT set_config('app.current_tenant_id', %s, true)", (TEST_TENANT_ID,))
    yield conn
    await conn.rollback()
    await conn.close()
