import uuid
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError

router = APIRouter(prefix="/v1/assessments", tags=["assessments"])


class AssessmentCreate(BaseModel):
    au_name: str


class AssessmentResponse(BaseModel):
    id: str
    au_name: str
    status: str
    created_by: str
    tenant_id: str


@router.get("")
async def list_assessments(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT id, au_name, status, created_by, tenant_id FROM app.assessments "
            "WHERE tenant_id = %s ORDER BY created_at DESC",
            (tenant_id,),
        )
        rows = await cur.fetchall()
    cols = ["id", "au_name", "status", "created_by", "tenant_id"]
    return [dict(zip(cols, r)) for r in rows]


@router.post("", status_code=201)
async def create_assessment(body: AssessmentCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    assessment_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.assessments (id, tenant_id, au_name, created_by) "
            "VALUES (%s, %s, %s, %s)",
            (assessment_id, tenant_id, body.au_name, user["id"]),
        )
    return {"assessment_id": assessment_id}


@router.get("/{assessment_id}")
async def get_assessment(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT id, au_name, status, created_by, tenant_id FROM app.assessments "
            "WHERE id = %s",
            (assessment_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise NotFoundError("assessment")
    cols = ["id", "au_name", "status", "created_by", "tenant_id"]
    return dict(zip(cols, row))
