from fastapi import APIRouter, Request
from pydantic import BaseModel
from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
import uuid

router = APIRouter(prefix="/v1/admin", tags=["admin"])


class TaxonomyCreate(BaseModel):
    name: str
    schema_data: dict


@router.get("/users")
async def list_users(request: Request):
    # Returns users from auth schema — scoped to tenant via app context
    return {"message": "User management endpoint — connect to auth service"}


@router.post("/taxonomy")
async def create_taxonomy(body: TaxonomyCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    taxonomy_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.taxonomy_schemas (id, tenant_id, name, schema) VALUES (%s, %s, %s, %s)",
            (taxonomy_id, tenant_id, body.name, body.schema_data),
        )
    return {"taxonomy_id": taxonomy_id}


@router.get("/taxonomy")
async def list_taxonomy(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT id, name, version, active FROM app.taxonomy_schemas "
            "WHERE tenant_id = %s ORDER BY created_at DESC",
            (tenant_id,),
        )
        rows = await cur.fetchall()
    return [{"id": r[0], "name": r[1], "version": r[2], "active": r[3]} for r in rows]
