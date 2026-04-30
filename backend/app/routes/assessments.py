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
    taxonomy_scope: Optional[str] = None
    risk_sources: Optional[list] = None


# ── Column-resilience cache ───────────────────────────────────
_SCOPE_COLS_EXIST: bool | None = None


async def _check_scope_cols(tenant_id: str) -> bool:
    global _SCOPE_COLS_EXIST
    if _SCOPE_COLS_EXIST is not None:
        return _SCOPE_COLS_EXIST
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessments'
                     AND column_name='taxonomy_scope'"""
            )
            _SCOPE_COLS_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _SCOPE_COLS_EXIST = False
    return _SCOPE_COLS_EXIST


@router.get("")
async def list_assessments(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_scope = await _check_scope_cols(tenant_id)

    if has_scope:
        sql = """SELECT id, title, description, scope, assessment_date, owner, business_unit,
                        status, current_step, taxonomy_scope, risk_sources,
                        created_by, tenant_id, created_at, updated_at
                 FROM app.assessments WHERE tenant_id = %s ORDER BY created_at DESC"""
    else:
        sql = """SELECT id, title, description, scope, assessment_date, owner, business_unit,
                        status, current_step,
                        created_by, tenant_id, created_at, updated_at
                 FROM app.assessments WHERE tenant_id = %s ORDER BY created_at DESC"""

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, (tenant_id,))
        rows = await cur.fetchall()

    if not has_scope:
        rows = [{**r, "taxonomy_scope": "both", "risk_sources": []} for r in rows]
    return rows


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
    has_scope = await _check_scope_cols(tenant_id)

    if has_scope:
        sql = """SELECT id, title, description, scope, assessment_date, owner, business_unit,
                        status, current_step, questionnaire, questionnaire_notes,
                        taxonomy_scope, risk_sources,
                        created_by, tenant_id, created_at, updated_at
                 FROM app.assessments WHERE id = %s"""
    else:
        sql = """SELECT id, title, description, scope, assessment_date, owner, business_unit,
                        status, current_step, questionnaire, questionnaire_notes,
                        created_by, tenant_id, created_at, updated_at
                 FROM app.assessments WHERE id = %s"""

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, (assessment_id,))
        row = await cur.fetchone()

    if not row:
        raise NotFoundError("assessment")

    if not has_scope:
        row = {**row, "taxonomy_scope": "both", "risk_sources": []}
    return row


@router.patch("/{assessment_id}")
async def patch_assessment(assessment_id: str, body: AssessmentPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_scope = await _check_scope_cols(tenant_id)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Drop scope columns if the migration hasn't run yet
    if not has_scope:
        updates.pop("taxonomy_scope", None)
        updates.pop("risk_sources", None)

    if not updates:
        return {"id": assessment_id}

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
