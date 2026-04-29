import uuid
from typing import Any, Optional
from fastapi import APIRouter, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError

router = APIRouter(prefix="/v1/assessments", tags=["assessments"])


class AssessmentCreate(BaseModel):
    title: str


class AssessmentPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[str] = None
    assessment_date: Optional[str] = None
    owner: Optional[str] = None
    business_unit: Optional[str] = None
    status: Optional[str] = None
    current_step: Optional[int] = None
    questionnaire: Optional[Any] = None
    questionnaire_notes: Optional[Any] = None


@router.get("")
async def list_assessments(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT id, title, description, scope, assessment_date, owner, business_unit,
                      status, current_step, created_by, tenant_id, created_at, updated_at
               FROM app.assessments WHERE tenant_id = %s ORDER BY created_at DESC""",
            (tenant_id,),
        )
        return await cur.fetchall()


@router.post("", status_code=201)
async def create_assessment(body: AssessmentCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    assessment_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.assessments (id, tenant_id, title, created_by) VALUES (%s, %s, %s, %s)",
            (assessment_id, tenant_id, body.title, user["id"]),
        )
    return {"id": assessment_id}


@router.get("/{assessment_id}")
async def get_assessment(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT id, title, description, scope, assessment_date, owner, business_unit,
                      status, current_step, questionnaire, questionnaire_notes,
                      created_by, tenant_id, created_at, updated_at
               FROM app.assessments WHERE id = %s""",
            (assessment_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise NotFoundError("assessment")
    return row


@router.patch("/{assessment_id}")
async def patch_assessment(assessment_id: str, body: AssessmentPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise NotFoundError("nothing to update")
    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [assessment_id]
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            f"UPDATE app.assessments SET {set_clauses}, updated_at = NOW() WHERE id = %s",
            values,
        )
    return {"id": assessment_id}


@router.delete("/{assessment_id}", status_code=204)
async def delete_assessment(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.assessments SET status = 'archived', updated_at = NOW() WHERE id = %s",
            (assessment_id,),
        )
