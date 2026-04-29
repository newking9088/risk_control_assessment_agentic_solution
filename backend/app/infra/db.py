from contextlib import asynccontextmanager
from typing import AsyncGenerator, Any, Optional

import psycopg
from psycopg_pool import AsyncConnectionPool

from app.config.settings import get_settings

settings = get_settings()
_pool: AsyncConnectionPool | None = None


async def init_db_pool() -> None:
    global _pool
    _pool = AsyncConnectionPool(
        conninfo=settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        open=True,
    )


async def close_db_pool() -> None:
    if _pool:
        await _pool.close()


@asynccontextmanager
async def get_conn() -> AsyncGenerator[psycopg.AsyncConnection, None]:
    if not _pool:
        raise RuntimeError("DB pool not initialised")
    async with _pool.connection() as conn:
        yield conn


@asynccontextmanager
async def get_tenant_cursor(tenant_id: str, row_factory: Optional[Any] = None):
    async with get_conn() as conn:
        async with conn.cursor(row_factory=row_factory) as cur:
            await cur.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                (str(tenant_id),),
            )
            yield cur
