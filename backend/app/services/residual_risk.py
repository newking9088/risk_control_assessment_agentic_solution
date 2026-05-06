"""
Step 6 – Matrix-based residual risk computation.

Matches the FRA's RESIDUAL_MATRIX pattern (lookup, not subtraction).

  residual_label = RESIDUAL_MATRIX[ce_label][inherent_label_index]

The combined inherent rating (stored in assessment_risks.inherent_impact after
Step 4) is the row key.  The per-risk CE (worst overall_effectiveness across
mapped controls) is the column key.  If no controls are mapped the CE defaults
to "Moderately Effective".
"""

import logging

from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.services.controls_effectiveness import aggregate_risk_ce

logger = logging.getLogger(__name__)

# ── Labels & matrix ───────────────────────────────────────────────────────────

INHERENT_LABELS = ["Low", "Medium", "High", "Very High"]

# RESIDUAL_MATRIX[ce_label][inherent_label_index]
RESIDUAL_MATRIX: dict[str, list[str]] = {
    "Effective":            ["Low",    "Low",    "Medium",    "High"     ],
    "Moderately Effective": ["Low",    "Medium", "High",      "Very High"],
    "Ineffective":          ["Medium", "High",   "Very High", "Very High"],
}

# ── Pure helper ───────────────────────────────────────────────────────────────

def compute_residual_risk(inherent_label: str, ce_label: str) -> str | None:
    """Return residual risk label via matrix lookup.

    Returns None when either label is unrecognised.
    """
    if inherent_label not in INHERENT_LABELS:
        return None
    if ce_label not in RESIDUAL_MATRIX:
        return None
    idx = INHERENT_LABELS.index(inherent_label)
    return RESIDUAL_MATRIX[ce_label][idx]


# ── Orchestration ─────────────────────────────────────────────────────────────

async def compute_residual_ratings(assessment_id: str, tenant_id: str) -> dict:
    """Compute residual risk for every applicable risk that has an inherent rating."""
    # Applicable risks that have been scored in Step 4
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT id, name, inherent_impact, inherent_likelihood
               FROM   app.assessment_risks
               WHERE  assessment_id = %s
                 AND  applicable    = TRUE
                 AND  inherent_impact IS NOT NULL""",
            (assessment_id,),
        )
        risks = await cur.fetchall()

    # All controls for this assessment (need overall_effectiveness per risk)
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT risk_id, overall_effectiveness
               FROM   app.assessment_controls
               WHERE  assessment_id = %s""",
            (assessment_id,),
        )
        controls = await cur.fetchall()

    # Group controls by risk_id
    controls_by_risk: dict[str, list[dict]] = {}
    for ctrl in controls:
        rid = str(ctrl["risk_id"]) if ctrl["risk_id"] else ""
        if rid:
            controls_by_risk.setdefault(rid, []).append(dict(ctrl))

    computed = 0
    for risk in risks:
        risk_dict = dict(risk)
        rid       = str(risk_dict["id"])

        inherent_label = risk_dict.get("inherent_impact") or ""
        ce_label       = aggregate_risk_ce(controls_by_risk.get(rid, []))
        if ce_label is None:
            ce_label = "Moderately Effective"   # default when no controls mapped

        residual_label = compute_residual_risk(inherent_label, ce_label)
        if residual_label is None:
            logger.warning(
                "residual_risk: skipping %s — unrecognised inherent_label=%r",
                risk_dict.get("name"), inherent_label,
            )
            continue

        # residual_likelihood mirrors inherent_likelihood (controls reduce impact, not frequency)
        async with get_tenant_cursor(tenant_id) as cur:
            await cur.execute(
                """UPDATE app.assessment_risks
                   SET residual_impact      = %s,
                       residual_likelihood  = %s
                   WHERE id = %s AND assessment_id = %s""",
                (
                    residual_label,
                    risk_dict.get("inherent_likelihood"),
                    risk_dict["id"],
                    assessment_id,
                ),
            )
        computed += 1
        logger.info(
            "residual_risk: %s → inherent=%s CE=%s residual=%s",
            risk_dict.get("name"), inherent_label, ce_label, residual_label,
        )

    return {
        "assessment_id":    assessment_id,
        "computed":         computed,
        "total_applicable": len(risks),
    }
