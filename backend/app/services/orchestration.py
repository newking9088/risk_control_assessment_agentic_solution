"""
Step 1 orchestration: runs Phases 1-3 for a given assessment.

Phase 1 – retrieve document chunks from DB
Phase 2 – parallel LLM extraction (overview + fraud surface) then profile
Phase 3 – assemble ao_snapshot and persist to app.ao_snapshots
"""

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.services.ao_overview import generate_ao_overview
from app.services.ao_profile import extract_ao_profile
from app.services.fraud_surface import extract_fraud_surface

logger = logging.getLogger(__name__)

_EXECUTOR = ThreadPoolExecutor(max_workers=3, thread_name_prefix="ao-worker")

_CHUNK_CATEGORIES = ("au_description", "ao_details", "process_desc")


# ── DB helpers ────────────────────────────────────────────────────────────────

async def select_ao_chunks(
    assessment_id: str,
    tenant_id: str,
    top_k: int = 6,
) -> list[str]:
    """Return up to *top_k* chunk texts, preferring AU-description categories."""
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT content FROM app.document_chunks
            WHERE  assessment_id = %s
              AND  category = ANY(%s::text[])
            ORDER  BY chunk_index
            LIMIT  %s
            """,
            (assessment_id, list(_CHUNK_CATEGORIES), top_k),
        )
        rows = await cur.fetchall()
        if rows:
            return [r["content"] for r in rows]

        # Fallback: any category
        await cur.execute(
            "SELECT content FROM app.document_chunks "
            "WHERE assessment_id = %s ORDER BY chunk_index LIMIT %s",
            (assessment_id, top_k),
        )
        rows = await cur.fetchall()
        return [r["content"] for r in rows]


async def get_ao_snapshot(assessment_id: str, tenant_id: str) -> dict | None:
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM app.ao_snapshots WHERE assessment_id = %s",
            (assessment_id,),
        )
        return await cur.fetchone()


async def save_ao_snapshot(
    assessment_id: str,
    tenant_id: str,
    snapshot: dict,
) -> None:
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """
            INSERT INTO app.ao_snapshots
              (assessment_id, tenant_id, snapshot_version,
               ao_summary, ao_display, operational_profile, fraud_surface)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            ON CONFLICT (assessment_id) DO UPDATE SET
              snapshot_version    = EXCLUDED.snapshot_version,
              ao_summary          = EXCLUDED.ao_summary,
              ao_display          = EXCLUDED.ao_display,
              operational_profile = EXCLUDED.operational_profile,
              fraud_surface       = EXCLUDED.fraud_surface,
              user_edited         = FALSE,
              updated_at          = now()
            """,
            (
                assessment_id,
                tenant_id,
                snapshot["snapshot_version"],
                snapshot["ao_summary"],
                json.dumps(snapshot["ao_display"]),
                json.dumps(snapshot["operational_profile"]),
                json.dumps(snapshot["fraud_surface"]),
            ),
        )


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_ao_phases(
    assessment_id: str,
    tenant_id: str,
    force: bool = False,
) -> dict:
    """
    Run all three preparation phases and return the assembled ao_snapshot dict.

    Raises ValueError if no documents are found for the assessment.
    """
    if not force:
        existing = await get_ao_snapshot(assessment_id, tenant_id)
        if existing:
            return dict(existing)

    # Phase 1 ─ retrieve chunks
    chunks = await select_ao_chunks(assessment_id, tenant_id, top_k=6)
    if not chunks:
        raise ValueError(
            "No documents found for this assessment. "
            "Upload an AU description before generating the overview."
        )

    evidence_text = "\n\n---\n\n".join(chunks)

    # Phase 2 ─ parallel LLM extraction
    loop = asyncio.get_event_loop()
    overview_fut = loop.run_in_executor(_EXECUTOR, generate_ao_overview, evidence_text)
    fraud_fut    = loop.run_in_executor(_EXECUTOR, extract_fraud_surface, evidence_text)
    profile_fut  = loop.run_in_executor(_EXECUTOR, extract_ao_profile,  evidence_text)

    overview_data, fraud_data, profile_data = await asyncio.gather(
        overview_fut, fraud_fut, profile_fut,
        return_exceptions=False,
    )

    # Phase 3 ─ assemble snapshot
    snapshot = {
        "snapshot_version": "1.0",
        "ao_summary": overview_data.get("summary", ""),
        "ao_display": {
            "in_scope_business_processes":     overview_data.get("in_scope_activities", []),
            "out_of_scope_business_processes": overview_data.get("out_of_scope_activities", []),
            "systems_or_tools":                overview_data.get("systems_or_tools", []),
            "channels":                        overview_data.get("channels", []),
            "populations_served":              overview_data.get("populations_served", []),
            "products_handled":                overview_data.get("products_handled", []),
            "org_partners":                    overview_data.get("org_partners", []),
            "regulatory_environment":          overview_data.get("regulatory_environment", []),
        },
        "operational_profile": profile_data,
        "fraud_surface":       fraud_data,
    }

    await save_ao_snapshot(assessment_id, tenant_id, snapshot)
    return snapshot
