import uuid
from typing import Optional
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError
from app.utils.risk_scope import risk_matches_scope

router = APIRouter(prefix="/v1/assessments", tags=["risks"])


class RiskCreate(BaseModel):
    name: str
    category: str
    source: str
    description: Optional[str] = None
    taxonomy_risk_id: Optional[str] = None


class RiskPatch(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    applicable: Optional[bool] = None
    inherent_likelihood: Optional[str] = None
    inherent_impact: Optional[str] = None
    residual_likelihood: Optional[str] = None
    residual_impact: Optional[str] = None
    rationale: Optional[str] = None
    applicability_confidence: Optional[float] = None
    confidence_label: Optional[str] = None
    decision_basis: Optional[str] = None
    requires_review: Optional[bool] = None
    likelihood_score: Optional[int] = None
    financial_impact: Optional[int] = None
    regulatory_impact: Optional[int] = None
    legal_impact: Optional[int] = None
    customer_impact: Optional[int] = None
    reputational_impact: Optional[int] = None
    likelihood_rationale: Optional[str] = None
    financial_rationale: Optional[str] = None
    regulatory_rationale: Optional[str] = None
    legal_rationale: Optional[str] = None
    customer_rationale: Optional[str] = None
    reputational_rationale: Optional[str] = None


# ── Column-resilience cache ───────────────────────────────────
_APPLIC_COLS_EXIST: bool | None = None
_IR_DIMS_EXIST: bool | None = None


async def _check_applic_cols(tenant_id: str) -> bool:
    global _APPLIC_COLS_EXIST
    if _APPLIC_COLS_EXIST is not None:
        return _APPLIC_COLS_EXIST
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessment_risks'
                     AND column_name='applicability_confidence'"""
            )
            _APPLIC_COLS_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _APPLIC_COLS_EXIST = False
    return _APPLIC_COLS_EXIST


async def _check_ir_dims(tenant_id: str) -> bool:
    global _IR_DIMS_EXIST
    if _IR_DIMS_EXIST is not None:
        return _IR_DIMS_EXIST
    try:
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessment_risks'
                     AND column_name='likelihood_score'"""
            )
            _IR_DIMS_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _IR_DIMS_EXIST = False
    return _IR_DIMS_EXIST


@router.get("/{assessment_id}/risks")
async def list_risks(
    assessment_id: str,
    request: Request,
    scope: Optional[str] = Query(None, description="Filter by risk scope: 'internal', 'external', or 'both'"),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_new = await _check_applic_cols(tenant_id)
    has_ir = await _check_ir_dims(tenant_id)

    sql = "SELECT id, assessment_id, name, category, source, description, applicable, inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, taxonomy_risk_id, rationale, approved_by"
    if has_new:
        sql += ", applicability_confidence, confidence_label, decision_basis, requires_review, extra_data"
    if has_ir:
        sql += ", likelihood_score, financial_impact, regulatory_impact, legal_impact, customer_impact, reputational_impact, likelihood_rationale, financial_rationale, regulatory_rationale, legal_rationale, customer_rationale, reputational_rationale"

    where = " WHERE assessment_id = %s"
    params: list = [assessment_id]
    if scope == "internal":
        where += " AND source = 'INT'"
    elif scope == "external":
        where += " AND source = 'EXT'"
    sql += f" , created_at FROM app.assessment_risks{where} ORDER BY category, name"

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        rows = await cur.fetchall()

    if not has_new:
        rows = [
            {**r, "applicability_confidence": None, "confidence_label": "manual",
             "decision_basis": "manual", "requires_review": False, "extra_data": {}}
            for r in rows
        ]
    if not has_ir:
        rows = [
            {**r, "likelihood_score": None, "financial_impact": None, "regulatory_impact": None,
             "legal_impact": None, "customer_impact": None, "reputational_impact": None,
             "likelihood_rationale": None, "financial_rationale": None, "regulatory_rationale": None,
             "legal_rationale": None, "customer_rationale": None, "reputational_rationale": None}
            for r in rows
        ]
    return rows


@router.post("/{assessment_id}/risks", status_code=201)
async def create_risk(assessment_id: str, body: RiskCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    risk_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """INSERT INTO app.assessment_risks
               (id, assessment_id, name, category, source, description, taxonomy_risk_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (risk_id, assessment_id, body.name, body.category, body.source,
             body.description, body.taxonomy_risk_id),
        )
    return {"id": risk_id}


@router.post("/{assessment_id}/risks/import-from-taxonomy", status_code=200)
async def import_risks_from_taxonomy(assessment_id: str, request: Request):
    """Load risks from the active taxonomy into assessment_risks (skip duplicates)."""
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    # Fetch active taxonomy with risks_data
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        # Check if risks_data column exists
        await cur.execute(
            """SELECT column_name FROM information_schema.columns
               WHERE table_schema='app' AND table_name='taxonomy_schemas'
                 AND column_name='risks_data'"""
        )
        has_risks_data = (await cur.fetchone()) is not None

        if not has_risks_data:
            return {"imported": 0, "skipped": 0, "message": "No taxonomy data available"}

        await cur.execute(
            """SELECT id, risks_data FROM app.taxonomy_schemas
               WHERE tenant_id = %s AND active = TRUE
               ORDER BY created_at DESC LIMIT 1""",
            (tenant_id,),
        )
        taxonomy = await cur.fetchone()

    if not taxonomy or not taxonomy["risks_data"]:
        return {"imported": 0, "skipped": 0, "filtered_out": 0, "scope": "both", "message": "No active taxonomy found"}

    risks_data = taxonomy["risks_data"]

    # Fetch the assessment's taxonomy_scope to filter imported risks
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT taxonomy_scope FROM app.assessments WHERE id = %s",
            (assessment_id,),
        )
        assessment_row = await cur.fetchone()
    scope = (assessment_row or {}).get("taxonomy_scope") or "both"

    # Filter risks to only those matching the assessment scope
    scoped_risks = [r for r in risks_data if risk_matches_scope(r, scope)]
    filtered_out = len(risks_data) - len(scoped_risks)

    imported = 0
    skipped = 0

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        # Get existing taxonomy_risk_ids for this assessment
        await cur.execute(
            "SELECT taxonomy_risk_id FROM app.assessment_risks WHERE assessment_id = %s",
            (assessment_id,),
        )
        existing = {row["taxonomy_risk_id"] for row in await cur.fetchall() if row["taxonomy_risk_id"]}

    async with get_tenant_cursor(tenant_id) as cur:
        for r in scoped_risks:
            tax_risk_id = r.get("risk_id", "")
            if tax_risk_id in existing:
                skipped += 1
                continue
            source = r.get("source", "EXT").upper()
            if source not in ("EXT", "INT"):
                source = "EXT"
            await cur.execute(
                """INSERT INTO app.assessment_risks
                   (id, assessment_id, name, category, source, description, taxonomy_risk_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (str(uuid.uuid4()), assessment_id,
                 r.get("name", ""), r.get("category", ""),
                 source, r.get("description", ""), tax_risk_id),
            )
            imported += 1

    return {"imported": imported, "skipped": skipped, "filtered_out": filtered_out, "scope": scope}


@router.patch("/{assessment_id}/risks/{risk_id}")
async def patch_risk(assessment_id: str, risk_id: str, body: RiskPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    has_new = await _check_applic_cols(tenant_id)
    has_ir = await _check_ir_dims(tenant_id)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Drop new columns if migration hasn't run
    if not has_new:
        for col in ("applicability_confidence", "confidence_label", "decision_basis", "requires_review"):
            updates.pop(col, None)

    # Drop IR dimension columns if migration hasn't run
    if not has_ir:
        for col in ("likelihood_score", "financial_impact", "regulatory_impact", "legal_impact",
                    "customer_impact", "reputational_impact", "likelihood_rationale",
                    "financial_rationale", "regulatory_rationale", "legal_rationale",
                    "customer_rationale", "reputational_rationale"):
            updates.pop(col, None)

    # Handle applicable=False explicitly (model_dump excludes False with if v is not None)
    raw = body.model_dump()
    if raw.get("applicable") is False:
        updates["applicable"] = False
    if raw.get("requires_review") is False and has_new:
        updates["requires_review"] = False

    if not updates:
        return {"id": risk_id}

    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [risk_id, assessment_id]
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            f"UPDATE app.assessment_risks SET {set_clauses} WHERE id = %s AND assessment_id = %s",
            values,
        )
    return {"id": risk_id}


@router.delete("/{assessment_id}/risks/{risk_id}", status_code=204)
async def delete_risk(assessment_id: str, risk_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "DELETE FROM app.assessment_risks WHERE id = %s AND assessment_id = %s",
            (risk_id, assessment_id),
        )


# ── LLM-driven agent endpoint (Phase 2) ──────────────────────
agent_router = APIRouter(prefix="/v1/agent", tags=["agent"])


class RiskTrigger(BaseModel):
    assessment_id: str


@agent_router.post("/risk-applicability")
async def generate_risk_applicability(body: RiskTrigger, request: Request):
    from app.services.risk_applicability import process_applicability
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    return await process_applicability(body.assessment_id, tenant_id)
