import uuid

from fastapi import APIRouter, Request
from psycopg.rows import dict_row
from pydantic import BaseModel

from app.config.constants import DEFAULT_TENANT_ID
from app.infra.db import get_tenant_cursor

router = APIRouter(prefix="/v1/assessments", tags=["controls"])


class ControlCreate(BaseModel):
    risk_id: str | None = None
    name: str
    type: str | None = None
    is_key: bool = False
    description: str | None = None


class ControlPatch(BaseModel):
    name: str | None = None
    control_ref: str | None = None
    type: str | None = None
    is_key: bool | None = None
    description: str | None = None
    design_effectiveness: int | None = None
    operating_effectiveness: int | None = None
    overall_effectiveness: str | None = None
    rationale: str | None = None
    evidence_ref: str | None = None


@router.get("/{assessment_id}/controls")
async def list_controls(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT id, assessment_id, risk_id, name, control_ref, type, is_key, description,
                      design_effectiveness, operating_effectiveness, overall_effectiveness,
                      rationale, evidence_ref, approved_by, created_at
               FROM app.assessment_controls WHERE assessment_id = %s ORDER BY created_at""",
            (assessment_id,),
        )
        return await cur.fetchall()


@router.post("/{assessment_id}/controls", status_code=201)
async def create_control(assessment_id: str, body: ControlCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    control_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """INSERT INTO app.assessment_controls
               (id, assessment_id, risk_id, name, type, is_key, description)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                control_id,
                assessment_id,
                body.risk_id,
                body.name,
                body.type,
                body.is_key,
                body.description,
            ),
        )
    return {"id": control_id}


@router.patch("/{assessment_id}/controls/{control_id}")
async def patch_control(assessment_id: str, control_id: str, body: ControlPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"id": control_id}
    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [control_id, assessment_id]
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            f"UPDATE app.assessment_controls SET {set_clauses} WHERE id = %s AND assessment_id = %s",
            values,
        )
    return {"id": control_id}


@router.delete("/{assessment_id}/controls/{control_id}", status_code=204)
async def delete_control(assessment_id: str, control_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "DELETE FROM app.assessment_controls WHERE id = %s AND assessment_id = %s",
            (control_id, assessment_id),
        )
