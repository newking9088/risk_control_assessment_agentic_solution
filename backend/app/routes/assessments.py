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
    unit_id: Optional[str] = None
    status: Optional[str] = None
    current_step: Optional[int] = None
    questionnaire: Optional[Any] = None
    questionnaire_notes: Optional[Any] = None
    taxonomy_scope: Optional[str] = None
    risk_sources: Optional[list] = None
    inherent_risk_rating: Optional[str] = None
    controls_effectiveness_rating: Optional[str] = None
    residual_risk_rating: Optional[str] = None
    assessment_end_date: Optional[str] = None


# ── Column-resilience caches ─────────────────────────────────
_SCOPE_COLS_EXIST: bool | None = None
_UNIT_COL_EXIST: bool | None = None
_DOC_CAT_COL_EXIST: bool | None = None
_RATING_COLS_EXIST: bool | None = None


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


async def _check_unit_col(tenant_id: str) -> bool:
    global _UNIT_COL_EXIST
    if _UNIT_COL_EXIST is not None:
        return _UNIT_COL_EXIST
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessments'
                     AND column_name='unit_id'"""
            )
            _UNIT_COL_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _UNIT_COL_EXIST = False
    return _UNIT_COL_EXIST


async def _check_doc_cat_col(tenant_id: str) -> bool:
    global _DOC_CAT_COL_EXIST
    if _DOC_CAT_COL_EXIST is not None:
        return _DOC_CAT_COL_EXIST
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessment_documents'
                     AND column_name='category'"""
            )
            _DOC_CAT_COL_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _DOC_CAT_COL_EXIST = False
    return _DOC_CAT_COL_EXIST


async def _check_rating_cols(tenant_id: str) -> bool:
    global _RATING_COLS_EXIST
    if _RATING_COLS_EXIST is not None:
        return _RATING_COLS_EXIST
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessments'
                     AND column_name='inherent_risk_rating'"""
            )
            _RATING_COLS_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _RATING_COLS_EXIST = False
    return _RATING_COLS_EXIST


@router.get("")
async def list_assessments(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_scope = await _check_scope_cols(tenant_id)
    has_unit = await _check_unit_col(tenant_id)
    has_ratings = await _check_rating_cols(tenant_id)

    extra_cols = ""
    if has_scope:
        extra_cols += ", taxonomy_scope, risk_sources"
    if has_unit:
        extra_cols += ", unit_id"
    if has_ratings:
        extra_cols += ", inherent_risk_rating, controls_effectiveness_rating, residual_risk_rating, assessment_end_date"

    sql = f"""SELECT id, title, description, scope, assessment_date, owner, business_unit,
                    status, current_step{extra_cols},
                    created_by, tenant_id, created_at, updated_at
             FROM app.assessments WHERE tenant_id = %s ORDER BY created_at DESC"""

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, (tenant_id,))
        rows = await cur.fetchall()

    defaults: dict = {}
    if not has_scope:
        defaults.update({"taxonomy_scope": "both", "risk_sources": []})
    if not has_unit:
        defaults.update({"unit_id": ""})
    if not has_ratings:
        defaults.update({
            "inherent_risk_rating": None,
            "controls_effectiveness_rating": None,
            "residual_risk_rating": None,
            "assessment_end_date": None,
        })
    if defaults:
        rows = [{**defaults, **r} for r in rows]
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
    has_unit = await _check_unit_col(tenant_id)
    has_ratings = await _check_rating_cols(tenant_id)

    extra_cols = ""
    if has_scope:
        extra_cols += ", taxonomy_scope, risk_sources"
    if has_unit:
        extra_cols += ", unit_id"
    if has_ratings:
        extra_cols += ", inherent_risk_rating, controls_effectiveness_rating, residual_risk_rating, assessment_end_date"

    sql = f"""SELECT id, title, description, scope, assessment_date, owner, business_unit,
                    status, current_step, questionnaire, questionnaire_notes{extra_cols},
                    created_by, tenant_id, created_at, updated_at
             FROM app.assessments WHERE id = %s"""

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, (assessment_id,))
        row = await cur.fetchone()

    if not row:
        raise NotFoundError("assessment")

    defaults: dict = {}
    if not has_scope:
        defaults.update({"taxonomy_scope": "both", "risk_sources": []})
    if not has_unit:
        defaults.update({"unit_id": ""})
    if not has_ratings:
        defaults.update({
            "inherent_risk_rating": None,
            "controls_effectiveness_rating": None,
            "residual_risk_rating": None,
            "assessment_end_date": None,
        })
    if defaults:
        row = {**defaults, **row}
    return row


@router.patch("/{assessment_id}")
async def patch_assessment(assessment_id: str, body: AssessmentPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_scope = await _check_scope_cols(tenant_id)
    has_unit = await _check_unit_col(tenant_id)
    has_ratings = await _check_rating_cols(tenant_id)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    raw = body.model_dump()
    if raw.get("applicable") is False:
        updates["applicable"] = False

    if not has_scope:
        updates.pop("taxonomy_scope", None)
        updates.pop("risk_sources", None)
    if not has_unit:
        updates.pop("unit_id", None)
    if not has_ratings:
        updates.pop("inherent_risk_rating", None)
        updates.pop("controls_effectiveness_rating", None)
        updates.pop("residual_risk_rating", None)
        updates.pop("assessment_end_date", None)

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


# ── Document sub-resources ────────────────────────────────────

@router.get("/{assessment_id}/documents")
async def list_documents(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_cat = await _check_doc_cat_col(tenant_id)

    if has_cat:
        sql = """SELECT id, filename, mime_type, blob_size_bytes, uploaded_at, category
                 FROM app.assessment_documents
                 WHERE assessment_id = %s
                 ORDER BY uploaded_at ASC"""
    else:
        sql = """SELECT id, filename, mime_type, blob_size_bytes, uploaded_at
                 FROM app.assessment_documents
                 WHERE assessment_id = %s
                 ORDER BY uploaded_at ASC"""

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, (assessment_id,))
        rows = await cur.fetchall()

    if not has_cat:
        rows = [{**r, "category": "au_description"} for r in rows]
    return rows


@router.delete("/{assessment_id}/documents/{doc_id}", status_code=204)
async def delete_document(assessment_id: str, doc_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "DELETE FROM app.assessment_documents WHERE id = %s AND assessment_id = %s",
            (doc_id, assessment_id),
        )
