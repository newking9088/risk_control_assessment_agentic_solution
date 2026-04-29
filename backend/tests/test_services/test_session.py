"""Tests for session validation, LRU cache, and circuit breaker in app.middleware.auth."""
import time
import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock
from starlette.requests import Request
from starlette.datastructures import Headers

from app.errors import UnauthorizedError


def _make_request(cookies: dict) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": Headers(
            raw=[(b"cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()).encode())]
        ).raw,
        "query_string": b"",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_no_cookies_raises_unauthorized():
    from app.middleware.auth import get_current_user
    request = _make_request({})
    with pytest.raises(UnauthorizedError):
        await get_current_user(request)


@pytest.mark.asyncio
async def test_valid_session_returns_user():
    import app.middleware.auth as auth_module
    # Reset circuit breaker state
    auth_module._cb_failures = 0
    auth_module._cb_open_until = 0.0
    auth_module._cache.clear()

    mock_user = {"id": "u1", "role": "analyst", "tenantId": "t1"}
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"user": mock_user}

    request = _make_request({"session": "abc123"})
    with patch("app.middleware.auth.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        user = await get_current_user(request)

    assert user["id"] == "u1"


@pytest.mark.asyncio
async def test_TTL_cache_hit_skips_http():
    import app.middleware.auth as auth_module
    auth_module._cb_failures = 0
    auth_module._cb_open_until = 0.0
    auth_module._cache.clear()

    mock_user = {"id": "u2", "role": "viewer", "tenantId": "t1"}
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"user": mock_user}

    request = _make_request({"session": "cached-cookie"})
    with patch("app.middleware.auth.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        await get_current_user(request)
        await get_current_user(request)

    # httpx should only have been called once (cache hit on second call)
    assert mock_client.get.call_count == 1


@pytest.mark.asyncio
async def test_circuit_breaker_opens_after_threshold():
    import app.middleware.auth as auth_module
    auth_module._cb_failures = 0
    auth_module._cb_open_until = 0.0
    auth_module._cache.clear()

    request = _make_request({"session": "cb-test-cookie"})
    with patch("app.middleware.auth.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.RequestError("connection refused"))
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        # Exhaust the threshold
        for _ in range(auth_module._CB_THRESHOLD):
            with pytest.raises(UnauthorizedError):
                await get_current_user(request)

    # Circuit is now open — next call should fail immediately without http
    assert auth_module._cb_open_until > time.monotonic()
    with pytest.raises(UnauthorizedError):
        await get_current_user(request)
