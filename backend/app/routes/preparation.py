"""
Step 1 – Preparation routes.

POST   /api/v1/assessments/{id}/ao-overview  – trigger AI pipeline (phases 1-3)
GET    /api/v1/assessments/{id}/ao-snapshot  – retrieve current snapshot
PUT    /api/v1/assessments/{id}/ao-profile   – user edits operational profile
"""

import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.config.constants import DEFAULT_TENANT_ID
from app.infra.db import get_tenant_cursor
from app.services.orchestration import run_ao_phases, get_ao_snapshot, save_ao_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/assessments", tags=["preparation"])


def _tenant(request: Request) -> str:
    return request.state.user.get("tenantId", DEFAULT_TENANT_ID)


# ── POST /ao-overview ─────────────────────────────────────────────────────────

class OverviewParams(BaseModel):
    force: bool = False


@router.post("/{assessment_id}/ao-overview")
async def generate_overview(
    assessment_id: str,
    request: Request,
    params: OverviewParams = OverviewParams(),
):
    """
    Trigger Phases 1-3 for the given assessment:
    document chunking → parallel LLM extraction → snapshot assembly.

    Returns the assembled ao_snapshot.  If a snapshot already exists and
    `force=False`, the cached version is returned immediately.
    """
    tenant_id = _tenant(request)
    try:
        snapshot = await run_ao_phases(assessment_id, tenant_id, force=params.force)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("AO overview failed for %s: %s", assessment_id, exc)
        raise HTTPException(status_code=500, detail="Failed to generate overview. Please retry.")
    return snapshot


# ── GET /ao-snapshot ──────────────────────────────────────────────────────────

@router.get("/{assessment_id}/ao-snapshot")
async def get_snapshot(assessment_id: str, request: Request):
    """Return the current AO snapshot, or 404 if none exists yet."""
    tenant_id = _tenant(request)
    snapshot = await get_ao_snapshot(assessment_id, tenant_id)
    if not snapshot:
        raise HTTPException(
            status_code=404,
            detail="No overview generated yet. Call POST /ao-overview first.",
        )
    return snapshot


# ── PUT /ao-profile ───────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    operational_profile: dict | None = None
    ao_summary: str | None = None
    ao_display: dict | None = None


@router.put("/{assessment_id}/ao-profile")
async def update_profile(
    assessment_id: str,
    request: Request,
    body: ProfileUpdate,
):
    """
    Allow the user to correct the AI-generated operational profile.
    Marks user_edited=TRUE so subsequent ao-overview calls with force=False
    do not overwrite the corrections.
    """
    tenant_id = _tenant(request)
    existing = await get_ao_snapshot(assessment_id, tenant_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="No snapshot to update. Generate the overview first.",
        )

    async with get_tenant_cursor(tenant_id) as cur:
        fields: list[str] = ["user_edited = TRUE", "updated_at = now()"]
        values: list = []

        if body.operational_profile is not None:
            fields.append("operational_profile = %s::jsonb")
            values.append(json.dumps(body.operational_profile))
        if body.ao_summary is not None:
            fields.append("ao_summary = %s")
            values.append(body.ao_summary)
        if body.ao_display is not None:
            fields.append("ao_display = %s::jsonb")
            values.append(json.dumps(body.ao_display))

        values.append(assessment_id)
        await cur.execute(
            f"UPDATE app.ao_snapshots SET {', '.join(fields)} WHERE assessment_id = %s",
            values,
        )

    return await get_ao_snapshot(assessment_id, tenant_id)
