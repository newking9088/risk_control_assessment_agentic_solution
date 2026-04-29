from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.llm_client import respond_json

router = APIRouter(prefix="/v1/risk-applicability", tags=["risks"])


class RiskTrigger(BaseModel):
    assessment_id: str


@router.post("")
async def generate_risk_applicability(body: RiskTrigger, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    result = respond_json(
        system="You are a risk assessment expert. Analyse the assessment context and "
               "return a JSON list of risks with applicability decisions.",
        user_content=f"Assessment ID: {body.assessment_id}. "
                     "Return: {{\"risks\": [{{\"risk_id\": str, \"applicable\": bool, \"rationale\": str}}]}}",
    )

    risks = result.get("risks", [])
    import uuid
    async with get_tenant_cursor(tenant_id) as cur:
        for risk in risks:
            await cur.execute(
                "INSERT INTO app.assessment_risks (id, assessment_id, risk_id, applicable, rationale) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT DO NOTHING",
                (str(uuid.uuid4()), body.assessment_id, risk["risk_id"],
                 risk.get("applicable"), risk.get("rationale")),
            )
    return {"risks": risks, "count": len(risks)}


@router.get("/{assessment_id}")
async def list_risks(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT id, risk_id, applicable, rationale, inherent_l, inherent_i, residual "
            "FROM app.assessment_risks WHERE assessment_id = %s",
            (assessment_id,),
        )
        rows = await cur.fetchall()
    cols = ["id", "risk_id", "applicable", "rationale", "inherent_l", "inherent_i", "residual"]
    return [dict(zip(cols, r)) for r in rows]
