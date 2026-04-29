import asyncio
import pytest
import psycopg
from psycopg.rows import dict_row

TEST_DB_URL = "postgresql://adminuser:adminuser_local_pw@localhost:5432/appdb"
TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001"
TEST_USER_ID = "00000000-0000-0000-0000-000000000099"

MOCK_AUTH_USER = {
    "id": "test-user-001",
    "name": "Test User",
    "email": "test@example.com",
    "role": "admin",
    "tenantId": TEST_TENANT_ID,
}


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


@pytest.fixture
def test_client():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.middleware.auth import get_current_user

    async def _mock_user():
        return MOCK_AUTH_USER

    app.dependency_overrides[get_current_user] = _mock_user
    client = TestClient(app, headers={"Origin": "http://localhost:3000"})
    yield client
    app.dependency_overrides.pop(get_current_user, None)
