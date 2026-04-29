from fastapi import APIRouter, Request
from pydantic import BaseModel
from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.llm_client import respond_json
import uuid

router = APIRouter(prefix="/v1/controls", tags=["controls"])


class ControlMappingTrigger(BaseModel):
    assessment_id: str


@router.post("/mapping")
async def generate_control_mapping(body: ControlMappingTrigger, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT id, risk_id FROM app.assessment_risks WHERE assessment_id = %s AND applicable = true",
            (body.assessment_id,),
        )
        risks = await cur.fetchall()

    result = respond_json(
        system="You are a controls expert. Map controls to each risk and identify gaps.",
        user_content=f"Risks: {risks}. Return: {{\"mappings\": ["
                     "{{\"risk_id\": str, \"controls\": [str], \"gaps\": [str]}}]}}",
    )

    mappings = result.get("mappings", [])
    async with get_tenant_cursor(tenant_id) as cur:
        for m in mappings:
            for ctrl in m.get("controls", []):
                await cur.execute(
                    "INSERT INTO app.assessment_controls (id, risk_id, control_id) VALUES (%s, %s, %s)",
                    (str(uuid.uuid4()), m["risk_id"], ctrl),
                )

    return {"mappings": mappings}


@router.get("/{assessment_id}")
async def list_controls(assessment_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT ac.id, ac.risk_id, ac.control_id, ac.design_eff, ac.operating_eff "
            "FROM app.assessment_controls ac "
            "JOIN app.assessment_risks ar ON ar.id = ac.risk_id "
            "WHERE ar.assessment_id = %s",
            (assessment_id,),
        )
        rows = await cur.fetchall()
    cols = ["id", "risk_id", "control_id", "design_eff", "operating_eff"]
    return [dict(zip(cols, r)) for r in rows]
