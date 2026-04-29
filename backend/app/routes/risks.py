import uuid
from typing import Optional
from fastapi import APIRouter, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError

router = APIRouter(prefix="/v1/assessments", tags=["risks"])


class RiskCreate(BaseModel):
    name: str
    category: str
    source: str
    description: Optional[str] = None


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


@router.get("/{assessment_id}/risks")
async def list_risks(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT id, assessment_id, name, category, source, description, applicable,
                      inherent_likelihood, inherent_impact, residual_likelihood, residual_impact,
                      taxonomy_risk_id, rationale, approved_by, created_at
               FROM app.assessment_risks WHERE assessment_id = %s ORDER BY created_at""",
            (assessment_id,),
        )
        return await cur.fetchall()


@router.post("/{assessment_id}/risks", status_code=201)
async def create_risk(assessment_id: str, body: RiskCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    risk_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """INSERT INTO app.assessment_risks
               (id, assessment_id, name, category, source, description)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (risk_id, assessment_id, body.name, body.category, body.source, body.description),
        )
    return {"id": risk_id}


@router.patch("/{assessment_id}/risks/{risk_id}")
async def patch_risk(assessment_id: str, risk_id: str, body: RiskPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
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
    from app.llm_client import respond_json
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    result = respond_json(
        system="You are a risk assessment expert. Return JSON list of applicable risks.",
        user_content=f"Assessment ID: {body.assessment_id}. "
                     'Return: {"risks": [{"name": str, "category": str, "source": str, "applicable": bool}]}',
    )
    risks = result.get("risks", [])
    async with get_tenant_cursor(tenant_id) as cur:
        for r in risks:
            if r.get("applicable"):
                await cur.execute(
                    "INSERT INTO app.assessment_risks (id, assessment_id, name, category, source) "
                    "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    (str(uuid.uuid4()), body.assessment_id, r["name"], r["category"], r.get("source", "EXT")),
                )
    return {"risks": risks, "count": len(risks)}
