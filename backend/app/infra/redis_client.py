import redis.asyncio as aioredis
from app.config.settings import get_settings

settings = get_settings()
_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    global _redis
    _redis = await aioredis.from_url(settings.redis_url, decode_responses=True)


async def close_redis() -> None:
    if _redis:
        await _redis.aclose()


def get_redis() -> aioredis.Redis:
    if not _redis:
        raise RuntimeError("Redis not initialised")
    return _redis


async def publish_event(session_id: str, event_type: str, **data) -> None:
    r = get_redis()
    import json
    payload = json.dumps({"type": event_type, **data})
    await r.publish(f"sse:{session_id}", payload)
