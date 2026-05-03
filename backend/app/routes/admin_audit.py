import uuid
from typing import Optional

from app.infra.db import get_tenant_cursor


async def log_event(
    tenant_id: str,
    event_type: str,
    actor_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    log_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.audit_logs "
            "(id, tenant_id, event_type, actor_id, actor_name, entity_type, entity_id, detail) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                log_id, tenant_id, event_type,
                actor_id, actor_name,
                entity_type, entity_id,
                detail or {},
            ),
        )
