import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError
from app.infra.db import get_tenant_cursor
from app.infra.redis_client import get_redis

router = APIRouter(prefix="/v1/assessments", tags=["assessments"])

_COLLAB_TABLE_EXISTS: bool | None = None


async def _check_collab_table(tenant_id: str) -> bool:
    global _COLLAB_TABLE_EXISTS
    if _COLLAB_TABLE_EXISTS is not None:
        return _COLLAB_TABLE_EXISTS
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema='app' AND table_name='assessment_collaborators'"
            )
            _COLLAB_TABLE_EXISTS = (await cur.fetchone()) is not None
    except Exception:
        _COLLAB_TABLE_EXISTS = False
    return _COLLAB_TABLE_EXISTS


async def _publish_assessment_event(assessment_id: str, user: dict, changed_fields: list) -> None:
    try:
        r = get_redis()
        payload = json.dumps({
            "type": "assessmentUpdated",
            "user_id": user.get("id"),
            "user_name": user.get("name", user.get("email", "Someone")),
            "changed_fields": changed_fields,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await r.publish(f"assessments:{assessment_id}:events", payload)
    except Exception:
        pass


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
async def list_assessments(
    request: Request,
    shared_with_me: bool = Query(False),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    user_id = user.get("id", "")
    has_scope = await _check_scope_cols(tenant_id)
    has_unit = await _check_unit_col(tenant_id)
    has_ratings = await _check_rating_cols(tenant_id)
    has_collab = await _check_collab_table(tenant_id)

    extra_cols = ""
    if has_scope:
        extra_cols += ", a.taxonomy_scope, a.risk_sources"
    if has_unit:
        extra_cols += ", a.unit_id"
    if has_ratings:
        extra_cols += ", a.inherent_risk_rating, a.controls_effectiveness_rating, a.residual_risk_rating, a.assessment_end_date"

    collab_col = ""
    collab_join = ""
    if has_collab:
        collab_col = ", COALESCE(c.collab_count, 0) AS collaborator_count"
        collab_join = (
            "LEFT JOIN ("
            "  SELECT assessment_id, COUNT(*) AS collab_count "
            "  FROM app.assessment_collaborators GROUP BY assessment_id"
            ") c ON c.assessment_id = a.id"
        )

    if shared_with_me and has_collab:
        sql = f"""SELECT a.id, a.title, a.description, a.scope, a.assessment_date, a.owner,
                         a.business_unit, a.status, a.current_step{extra_cols},
                         a.created_by, a.tenant_id, a.created_at, a.updated_at{collab_col}
                  FROM app.assessments a
                  JOIN app.assessment_collaborators ac ON ac.assessment_id = a.id AND ac.user_id = %s
                  {collab_join}
                  WHERE a.tenant_id = %s ORDER BY a.created_at DESC"""
        params = (user_id, tenant_id)
    else:
        sql = f"""SELECT a.id, a.title, a.description, a.scope, a.assessment_date, a.owner,
                         a.business_unit, a.status, a.current_step{extra_cols},
                         a.created_by, a.tenant_id, a.created_at, a.updated_at{collab_col}
                  FROM app.assessments a
                  {collab_join}
                  WHERE a.tenant_id = %s ORDER BY a.created_at DESC"""
        params = (tenant_id,)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, params)
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
    if not has_collab:
        defaults["collaborator_count"] = 0
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
    await _publish_assessment_event(assessment_id, user, list(updates.keys()))
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
