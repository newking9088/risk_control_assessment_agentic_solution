import asyncio
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.llm_client import get_client
from app.config.settings import get_settings
from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
import uuid

router = APIRouter(prefix="/v1/chat", tags=["chat"])
settings = get_settings()


class ChatMessage(BaseModel):
    session_id: str
    message: str
    assessment_id: str | None = None


@router.post("")
async def chat_stream(body: ChatMessage, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async def event_generator():
        client = get_client()
        messages = [
            {"role": "system", "content": "You are an AI assistant helping with risk and control assessments. "
                                           "Be precise, professional, and concise."},
            {"role": "user", "content": body.message},
        ]
        try:
            stream = client.chat.completions.create(
                model=settings.openai_model,
                messages=messages,
                stream=True,
                temperature=0.3,
            )
            full_response = ""
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full_response += delta
                    yield f"data: {json.dumps({'type': 'chat:token', 'token': delta})}\n\n"

            yield f"data: {json.dumps({'type': 'chat:done'})}\n\n"

            async with get_tenant_cursor(tenant_id) as cur:
                await cur.execute(
                    "INSERT INTO app.chat_messages (id, session_id, role, content) VALUES (%s, %s, %s, %s)",
                    (str(uuid.uuid4()), body.session_id, "user", body.message),
                )
                await cur.execute(
                    "INSERT INTO app.chat_messages (id, session_id, role, content) VALUES (%s, %s, %s, %s)",
                    (str(uuid.uuid4()), body.session_id, "assistant", full_response),
                )
        except Exception as e:
            yield f"data: {json.dumps({'type': 'chat:error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{session_id}/history")
async def get_chat_history(session_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT role, content, timestamp FROM app.chat_messages "
            "WHERE session_id = %s ORDER BY timestamp ASC",
            (session_id,),
        )
        rows = await cur.fetchall()
    return [{"role": r[0], "content": r[1], "timestamp": r[2].isoformat()} for r in rows]
