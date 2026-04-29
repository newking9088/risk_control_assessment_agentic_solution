from fastapi import APIRouter
from app.infra.db import get_conn
from app.infra.redis_client import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    status = {"api": "ok", "db": "unknown", "redis": "unknown"}
    try:
        async with get_conn() as conn:
            await conn.execute("SELECT 1")
        status["db"] = "ok"
    except Exception:
        status["db"] = "error"
    try:
        await get_redis().ping()
        status["redis"] = "ok"
    except Exception:
        status["redis"] = "error"
    return status
