"""
Step 5 – AI-driven controls effectiveness evaluation.

For every control linked to a risk the LLM scores:
  - design_effectiveness    (INT 1-3 → stored in assessment_controls)
  - operating_effectiveness (INT 1-3 → stored in assessment_controls)
  - overall_effectiveness   (TEXT label → stored in assessment_controls)

Per-risk CE = worst (minimum) overall_effectiveness across all mapped controls.
"""

import logging

from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.llm_client import respond_json

logger = logging.getLogger(__name__)

# ── Labels & score map ────────────────────────────────────────────────────────

EFFECTIVENESS_LABELS = ["Ineffective", "Moderately Effective", "Effective"]
EFF_SCORE = {"Ineffective": 1, "Moderately Effective": 2, "Effective": 3}

# ── LLM prompts ───────────────────────────────────────────────────────────────

_CE_SYSTEM = """\
You are evaluating the effectiveness of a fraud control.
Score design effectiveness (is the control well-designed?) and
operating effectiveness (is it consistently executed?) on a 3-point scale:
- Effective:           Control is well-designed/consistently executed
- Moderately Effective: Control has gaps but provides partial coverage
- Ineffective:         Control is poorly designed/not consistently executed

overall_effectiveness should reflect the weaker of design and operating scores.

Return STRICT JSON (no markdown):
{
  "design_effectiveness":    "Effective|Moderately Effective|Ineffective",
  "operating_effectiveness": "Effective|Moderately Effective|Ineffective",
  "overall_effectiveness":   "Effective|Moderately Effective|Ineffective",
  "rationale":               "1-2 sentences explaining the assessment"
}
"""

_CE_USER = """\
CONTROL NAME: {control_name}
CONTROL TYPE: {control_type}
CONTROL DESCRIPTION: {control_description}
RISK THIS CONTROL ADDRESSES: {risk_name}
RISK DESCRIPTION: {risk_description}
ASSESSMENT UNIT SUMMARY: {au_summary}

Evaluate the effectiveness of this control for mitigating the stated fraud risk in this AU.
"""

# ── Pure helpers ──────────────────────────────────────────────────────────────

def _normalize_eff(raw: str | None) -> str:
    """Normalise LLM effectiveness label, case-insensitive."""
    if not raw:
        return "Moderately Effective"
    raw_lower = raw.strip().lower()
    for label in EFFECTIVENESS_LABELS:
        if label.lower() == raw_lower:
            return label
    return "Moderately Effective"


def evaluate_control(control: dict, risk: dict, au_summary: str) -> dict:
    """Call LLM to score one control; return normalised effectiveness dict."""
    user_content = _CE_USER.format(
        control_name=control.get("name", ""),
        control_type=control.get("type", "") or "",
        control_description=control.get("description", "") or "",
        risk_name=risk.get("name", ""),
        risk_description=risk.get("description", "") or "",
        au_summary=au_summary or "(not available)",
    )
    raw = respond_json(system=_CE_SYSTEM, user_content=user_content)
    if not isinstance(raw, dict):
        raw = {}

    design    = _normalize_eff(raw.get("design_effectiveness"))
    operating = _normalize_eff(raw.get("operating_effectiveness"))
    overall   = _normalize_eff(raw.get("overall_effectiveness"))

    return {
        "design_effectiveness":          design,
        "design_effectiveness_score":    EFF_SCORE[design],
        "operating_effectiveness":       operating,
        "operating_effectiveness_score": EFF_SCORE[operating],
        "overall_effectiveness":         overall,
        "overall_effectiveness_score":   EFF_SCORE[overall],
        "rationale":                     str(raw.get("rationale", "")),
    }


def aggregate_risk_ce(controls_for_risk: list[dict]) -> str | None:
    """Return worst (minimum score) overall_effectiveness label across controls.

    Returns None when no controls are mapped to the risk.
    """
    if not controls_for_risk:
        return None
    scores = [EFF_SCORE.get(c.get("overall_effectiveness", ""), 0)
              for c in controls_for_risk]
    worst_score = min(scores, default=0)
    for label, score in EFF_SCORE.items():
        if score == worst_score:
            return label
    return None


# ── Orchestration ─────────────────────────────────────────────────────────────

async def evaluate_all_controls(assessment_id: str, tenant_id: str) -> dict:
    """Score every control for *assessment_id* and persist results."""
    from app.services.orchestration import get_ao_snapshot

    snapshot   = await get_ao_snapshot(assessment_id, tenant_id)
    au_summary = (snapshot or {}).get("ao_summary") or ""

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT c.*,
                      r.name        AS risk_name,
                      r.description AS risk_description
               FROM   app.assessment_controls c
               LEFT JOIN app.assessment_risks r ON r.id = c.risk_id
               WHERE  c.assessment_id = %s
               ORDER  BY c.created_at""",
            (assessment_id,),
        )
        controls = await cur.fetchall()

    scored = 0
    for ctrl in controls:
        ctrl_dict = dict(ctrl)
        risk_ctx  = {
            "name":        ctrl_dict.get("risk_name", ""),
            "description": ctrl_dict.get("risk_description", ""),
        }
        result = evaluate_control(ctrl_dict, risk_ctx, au_summary)

        async with get_tenant_cursor(tenant_id) as cur:
            await cur.execute(
                """UPDATE app.assessment_controls
                   SET design_effectiveness    = %s,
                       operating_effectiveness = %s,
                       overall_effectiveness   = %s,
                       rationale               = %s
                   WHERE id = %s AND assessment_id = %s""",
                (
                    result["design_effectiveness_score"],
                    result["operating_effectiveness_score"],
                    result["overall_effectiveness"],
                    result["rationale"],
                    ctrl_dict["id"],
                    assessment_id,
                ),
            )
        scored += 1
        logger.info(
            "controls_effectiveness: %s → %s",
            ctrl_dict.get("name"), result["overall_effectiveness"],
        )

    return {
        "assessment_id":   assessment_id,
        "controls_scored": scored,
    }
