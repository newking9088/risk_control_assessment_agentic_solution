from fastapi import APIRouter, Request
from pydantic import BaseModel
from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID

router = APIRouter(prefix="/v1/settings", tags=["settings"])

DEFAULT_SETTINGS = {
    "risk_framework": "standard",
    "likelihood_labels": ["Unlikely", "Possible", "Likely", "Very Likely"],
    "impact_labels": ["Low", "Moderate", "High", "Very High"],
    "severity_calculation": "worst_case",
    "rating_tier": "4tier",
    "document_analysis": "flag_unrated",
    "profile_conflict": "profile_wins_unless_scanned",
    "issue_statement_word_count": 100,
    "override_badge": True,
    "ai_risk_callout": True,
    "mini_ai_tag": False,
    "ai_header_flag": True,
    "ai_disclaimer": True,
    "llm_provider": "openai",
    "llm_model": "gpt-4o",
    "llm_temperature": 0.3,
    "llm_top_p": 0.8,
    "llm_max_tokens": 1500,
    "auto_logout_minutes": 60,
}


class SettingsUpsert(BaseModel):
    settings: dict


@router.get("")
async def get_settings(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT settings FROM app.tenant_settings WHERE tenant_id = %s",
            (tenant_id,),
        )
        row = await cur.fetchone()
    if not row:
        return DEFAULT_SETTINGS
    return {**DEFAULT_SETTINGS, **row[0]}


@router.post("")
async def upsert_settings(body: SettingsUpsert, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """
            INSERT INTO app.tenant_settings (tenant_id, settings, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (tenant_id) DO UPDATE
              SET settings = EXCLUDED.settings,
                  updated_at = now()
            """,
            (tenant_id, body.settings),
        )
    return {"ok": True}


@router.post("/clear-cache")
async def clear_cache(request: Request):
    return {"ok": True}


@router.post("/reset")
async def reset_workspace(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "DELETE FROM app.tenant_settings WHERE tenant_id = %s",
            (tenant_id,),
        )
    return {"ok": True}


@router.post("/reset-defaults")
async def reset_defaults(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """
            INSERT INTO app.tenant_settings (tenant_id, settings, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (tenant_id) DO UPDATE
              SET settings = EXCLUDED.settings,
                  updated_at = now()
            """,
            (tenant_id, DEFAULT_SETTINGS),
        )
    return {"ok": True}
