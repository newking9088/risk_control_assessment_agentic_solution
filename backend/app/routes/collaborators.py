import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from psycopg.rows import dict_row
from pydantic import BaseModel

from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError
from app.infra.db import get_tenant_cursor
from app.infra.redis_client import get_redis

router = APIRouter(prefix="/v1/assessments", tags=["collaborators"])


class CollaboratorAdd(BaseModel):
    user_email: str
    display_name: Optional[str] = None
    role: str = "editor"


class CollaboratorPatch(BaseModel):
    role: str


class HeartbeatBody(BaseModel):
    display_name: Optional[str] = None
    role: str = "reader"


# ── Collaborators CRUD ────────────────────────────────────────────

@router.get("/{assessment_id}/collaborators")
async def list_collaborators(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id, user_id, user_email, display_name, role, invited_by, created_at "
            "FROM app.assessment_collaborators "
            "WHERE assessment_id = %s ORDER BY created_at",
            (assessment_id,),
        )
        return await cur.fetchall()


@router.post("/{assessment_id}/collaborators", status_code=201)
async def add_collaborator(assessment_id: str, body: CollaboratorAdd, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    collab_id = str(uuid.uuid4())
    notif_id = str(uuid.uuid4())

    # Use email as user_id placeholder when real user lookup isn't available
    target_user_id = body.user_email

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.assessment_collaborators "
            "(id, tenant_id, assessment_id, user_id, user_email, display_name, role, invited_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (assessment_id, user_id) DO NOTHING",
            (
                collab_id, tenant_id, assessment_id,
                target_user_id, body.user_email,
                body.display_name or body.user_email.split("@")[0],
                body.role, user.get("id"),
            ),
        )
        # Create collab_invite notification
        await cur.execute(
            "INSERT INTO app.notifications "
            "(id, tenant_id, user_id, type, body, assessment_id, actor_id, actor_name) "
            "VALUES (%s, %s, %s, 'collab_invite', %s, %s, %s, %s)",
            (
                notif_id, tenant_id, target_user_id,
                f"You have been invited to collaborate on an assessment as {body.role}.",
                assessment_id, user.get("id"),
                user.get("name", user.get("email", "Someone")),
            ),
        )

    # Push notification via Redis
    try:
        r = get_redis()
        notif_payload = json.dumps({
            "type": "collab_invite",
            "body": f"You were invited to collaborate as {body.role}.",
            "assessment_id": assessment_id,
        })
        await r.publish(f"rcanotify:{target_user_id}", notif_payload)
    except Exception:
        pass

    return {"id": collab_id}


@router.patch("/{assessment_id}/collaborators/{collab_id}")
async def update_collaborator(
    assessment_id: str, collab_id: str, body: CollaboratorPatch, request: Request
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.assessment_collaborators SET role = %s "
            "WHERE id = %s AND assessment_id = %s",
            (body.role, collab_id, assessment_id),
        )
        if cur.rowcount == 0:
            raise NotFoundError("collaborator")
    return {"id": collab_id}


@router.delete("/{assessment_id}/collaborators/{collab_id}", status_code=204)
async def remove_collaborator(assessment_id: str, collab_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "DELETE FROM app.assessment_collaborators WHERE id = %s AND assessment_id = %s",
            (collab_id, assessment_id),
        )
        if cur.rowcount == 0:
            raise NotFoundError("collaborator")


# ── Presence ──────────────────────────────────────────────────────

@router.get("/{assessment_id}/presence")
async def list_presence(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    stale_cutoff = "NOW() - INTERVAL '5 minutes'"

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        # Prune stale rows first
        await cur.execute(
            f"DELETE FROM app.presence WHERE assessment_id = %s AND last_heartbeat < {stale_cutoff}",
            (assessment_id,),
        )
        await cur.execute(
            "SELECT user_id, display_name, role, last_heartbeat "
            "FROM app.presence WHERE assessment_id = %s ORDER BY last_heartbeat DESC",
            (assessment_id,),
        )
        return await cur.fetchall()


@router.post("/{assessment_id}/presence")
async def heartbeat(assessment_id: str, body: HeartbeatBody, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    user_id = user.get("id", "anon")
    display_name = body.display_name or user.get("email", "Anonymous")
    stale_cutoff = "NOW() - INTERVAL '5 minutes'"

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        # Upsert presence
        await cur.execute(
            "INSERT INTO app.presence (id, tenant_id, assessment_id, user_id, display_name, role) "
            "VALUES (%s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (assessment_id, user_id) DO UPDATE "
            "SET last_heartbeat = NOW(), display_name = EXCLUDED.display_name, role = EXCLUDED.role",
            (str(uuid.uuid4()), tenant_id, assessment_id, user_id, display_name, body.role),
        )
        # Prune stale and return active
        await cur.execute(
            f"DELETE FROM app.presence WHERE assessment_id = %s AND last_heartbeat < {stale_cutoff}",
            (assessment_id,),
        )
        await cur.execute(
            "SELECT user_id, display_name, role, last_heartbeat "
            "FROM app.presence WHERE assessment_id = %s ORDER BY last_heartbeat DESC",
            (assessment_id,),
        )
        return await cur.fetchall()


# ── SSE Event Stream ──────────────────────────────────────────────

@router.get("/{assessment_id}/events")
async def assessment_events(assessment_id: str, request: Request):
    async def generator():
        r = get_redis()
        pubsub = r.pubsub()
        channel = f"assessments:{assessment_id}:events"
        await pubsub.subscribe(channel)
        try:
            yield f"data: {json.dumps({'type': 'connected', 'assessment_id': assessment_id})}\n\n"
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
