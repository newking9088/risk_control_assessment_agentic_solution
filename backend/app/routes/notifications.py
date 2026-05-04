import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from psycopg.rows import dict_row

from app.config.constants import DEFAULT_TENANT_ID
from app.infra.db import get_tenant_cursor
from app.infra.redis_client import get_redis

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    request: Request,
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    user_id = user.get("id", "")

    extra = " AND read = FALSE" if unread_only else ""
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT id, type, body, assessment_id, actor_id, actor_name, read, created_at "
            f"FROM app.notifications WHERE user_id = %s{extra} "
            f"ORDER BY created_at DESC LIMIT %s",
            (user_id, limit),
        )
        rows = await cur.fetchall()
        await cur.execute(
            "SELECT COUNT(*) AS cnt FROM app.notifications WHERE user_id = %s AND read = FALSE",
            (user_id,),
        )
        unread = (await cur.fetchone())["cnt"]

    return {"notifications": rows, "unread_count": int(unread)}


@router.patch("/{notif_id}/read")
async def mark_read(notif_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    user_id = user.get("id", "")

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.notifications SET read = TRUE WHERE id = %s AND user_id = %s",
            (notif_id, user_id),
        )
    return {"id": notif_id}


@router.patch("/read-all")
async def mark_all_read(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    user_id = user.get("id", "")

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.notifications SET read = TRUE WHERE user_id = %s AND read = FALSE",
            (user_id,),
        )
    return {"ok": True}


@router.get("/stream")
async def notification_stream(request: Request):
    user = request.state.user
    user_id = user.get("id", "anon")

    async def generator():
        r = get_redis()
        pubsub = r.pubsub()
        channel = f"rcanotify:{user_id}"
        await pubsub.subscribe(channel)
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                msg = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True),
                    timeout=15.0,
                )
                if msg and msg.get("type") == "message":
                    yield f"data: {msg['data']}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except (asyncio.TimeoutError, GeneratorExit):
            pass
        except Exception:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
            except Exception:
                pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
