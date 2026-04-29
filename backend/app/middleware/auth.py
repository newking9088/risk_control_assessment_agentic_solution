import hashlib
import time
from collections import OrderedDict
from typing import Any

import httpx
from fastapi import Request

from app.config.settings import get_settings
from app.errors import UnauthorizedError

settings = get_settings()

# Simple LRU cache: SHA-256(cookies) → (user_dict, expires_at)
_cache: OrderedDict[str, tuple[dict, float]] = OrderedDict()
_CACHE_TTL = 60
_CACHE_MAX = 2048

# Circuit breaker state
_cb_failures = 0
_cb_open_until = 0.0
_CB_THRESHOLD = 5
_CB_TIMEOUT = 30


def _cache_key(cookies: dict) -> str:
    raw = "&".join(f"{k}={v}" for k, v in sorted(cookies.items()))
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key: str) -> dict | None:
    entry = _cache.get(key)
    if not entry:
        return None
    user, expires_at = entry
    if time.monotonic() > expires_at:
        _cache.pop(key, None)
        return None
    _cache.move_to_end(key)
    return user


def _cache_set(key: str, user: dict) -> None:
    if len(_cache) >= _CACHE_MAX:
        _cache.popitem(last=False)
    _cache[key] = (user, time.monotonic() + _CACHE_TTL)


async def get_current_user(request: Request) -> dict[str, Any]:
    global _cb_failures, _cb_open_until

    cookies = dict(request.cookies)
    if not cookies:
        raise UnauthorizedError()

    key = _cache_key(cookies)
    cached = _cache_get(key)
    if cached:
        return cached

    now = time.monotonic()
    if now < _cb_open_until:
        raise UnauthorizedError()

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.auth_service_url}/api/auth/get-session",
                cookies=cookies,
            )
        if resp.status_code != 200:
            raise UnauthorizedError()
        data = resp.json()
        if not data or not data.get("user"):
            raise UnauthorizedError()
        user = data["user"]
        _cb_failures = 0
        _cache_set(key, user)
        return user
    except (httpx.RequestError, httpx.TimeoutException):
        _cb_failures += 1
        if _cb_failures >= _CB_THRESHOLD:
            _cb_open_until = time.monotonic() + _CB_TIMEOUT
        raise UnauthorizedError()
