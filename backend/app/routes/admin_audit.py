import uuid

from app.infra.db import get_tenant_cursor


async def log_event(
    tenant_id: str,
    event_type: str,
    actor_id: str | None = None,
    actor_name: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    detail: dict | None = None,
) -> None:
    log_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.audit_logs "
            "(id, tenant_id, event_type, actor_id, actor_name, entity_type, entity_id, detail) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                log_id,
                tenant_id,
                event_type,
                actor_id,
                actor_name,
                entity_type,
                entity_id,
                detail or {},
            ),
        )
