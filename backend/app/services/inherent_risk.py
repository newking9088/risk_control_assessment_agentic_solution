"""
Step 4 – AI-driven inherent risk scoring.

For each applicable risk the LLM scores:
  - Likelihood (4-tier)
  - Five impact dimensions: Financial, Regulatory, Legal, Customer, Reputational (4-tier each)
  - Inherent risk rating = INHERENT_MATRIX[impact_index][likelihood_index]

Numeric scores (1–4) are written to the SMALLINT columns; text labels go to
inherent_likelihood / inherent_impact; rationales to the *_rationale columns.
"""

import logging

from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.llm_client import respond_json
from app.services.orchestration import get_ao_snapshot, select_ao_chunks
from app.services.qa_engine import get_qa_profile
from app.services.risk_applicability import _get_relevant_cats, format_relevant_qa

logger = logging.getLogger(__name__)

# ── Labels & score maps ───────────────────────────────────────────────────────

LIKELIHOOD_LABELS = ["Unlikely", "Possible", "Likely", "Almost Certain"]
IMPACT_LABELS     = ["Low", "Medium", "High", "Very High"]

SCORE_MAP        = {"Unlikely": 1, "Possible": 2, "Likely": 3, "Almost Certain": 4}
IMPACT_SCORE_MAP = {"Low": 1, "Medium": 2, "High": 3, "Very High": 4}

# INHERENT_MATRIX[impact_index][likelihood_index]  (both 0-3)
INHERENT_MATRIX = [
    ["Low",    "Low",    "Medium",    "Medium"   ],  # Low impact
    ["Low",    "Medium", "Medium",    "High"     ],  # Medium impact
    ["Medium", "Medium", "High",      "Very High"],  # High impact
    ["Medium", "High",   "Very High", "Very High"],  # Very High impact
]

# ── LLM prompts ───────────────────────────────────────────────────────────────

_SYSTEM = """\
You are a Senior Banking Risk SME performing inherent risk assessment for Fraud Risk.
RULES:
- Base ratings on the risk statement + AU operational context + QA evidence.
- Write concise, defensible rationales in professional banking tone.
- Rationales are operational — do NOT mention controls, monitoring, or mitigations.
- Use only the exact label strings provided.

LABELS:
- Likelihood: ["Unlikely", "Possible", "Likely", "Almost Certain"]
- Impact:     ["Low", "Medium", "High", "Very High"]

LIKELIHOOD INTERPRETATIONS:
- Unlikely:      Could happen but not expected in normal operations (< once per year)
- Possible:      May occur periodically (1-3 times per year)
- Likely:        Expected to occur regularly (quarterly or more)
- Almost Certain: Expected to occur frequently (monthly or more)

IMPACT DIMENSIONS:
- Financial:     Low=minimal loss, Medium=moderate loss, High=significant loss, Very High=severe loss
- Regulatory:    Low=minor notes, Medium=moderate fines/actions, High=significant enforcement, Very High=severe enforcement
- Legal:         Low=minimal legal exposure, Medium=notable litigation risk, High=significant litigation, Very High=material litigation
- Customer:      Low=minimal impact, Medium=limited dissatisfaction, High=significant harm, Very High=systemic harm
- Reputational:  Low=minimal media, Medium=moderate coverage, High=significant coverage, Very High=systemic trust loss

Return STRICT JSON (no markdown):
{
  "likelihood":                   "<label>",
  "likelihood_rationale":         "2-3 sentences grounded in AU operations",
  "financial_impact":             "<label>",
  "financial_rationale":          "2-3 sentences",
  "regulatory_impact":            "<label>",
  "regulatory_rationale":         "2-3 sentences",
  "legal_impact":                 "<label>",
  "legal_rationale":              "2-3 sentences",
  "customer_impact":              "<label>",
  "customer_rationale":           "2-3 sentences",
  "reputational_impact":          "<label>",
  "reputational_rationale":       "2-3 sentences",
  "inherent_risk_rating_rationale": "2-3 sentences: likelihood driver → impact driver → conclusion"
}
"""

_USER = """\
ASSESSMENT UNIT: {au_name}
AU SUMMARY: {ao_summary}
RISK STATEMENT: {risk_statement}
RISK NAME: {risk_name}
RISK DESCRIPTION: {risk_description}
AU EVIDENCE (QA answers relevant to this risk):
{qa_block}

Score the inherent risk for this AU.
"""

# ── Pure helpers ──────────────────────────────────────────────────────────────

def normalize_label(raw: str | None, allowed_labels: list[str], default: str) -> str:
    """Map LLM output to exact allowed label, case-insensitive; return default on no match."""
    if not raw:
        return default
    raw_lower = raw.strip().lower()
    for label in allowed_labels:
        if label.lower() == raw_lower:
            return label
    return default


def compute_overall_impact(scores_dict: dict) -> str:
    """Worst-of-five impact dimensions (matches FRA default aggregation)."""
    dims = ["financial_impact", "regulatory_impact", "legal_impact",
            "customer_impact", "reputational_impact"]
    values = [IMPACT_SCORE_MAP.get(scores_dict.get(d, "Low"), 1) for d in dims]
    max_score = max(values, default=1)
    return IMPACT_LABELS[max_score - 1]


def compute_inherent_rating(likelihood_label: str, overall_impact_label: str) -> str:
    """Return inherent rating label via INHERENT_MATRIX lookup."""
    li = max(0, min(3, SCORE_MAP.get(likelihood_label, 2) - 1))
    ii = max(0, min(3, IMPACT_SCORE_MAP.get(overall_impact_label, 1) - 1))
    return INHERENT_MATRIX[ii][li]


def score_single_risk(
    risk: dict,
    au_name: str,
    ao_summary: str,
    qa_block: str,
) -> dict:
    """Call LLM, normalise labels, compute scores and inherent rating."""
    user_content = _USER.format(
        au_name=au_name,
        ao_summary=ao_summary or "(not available)",
        risk_statement=risk.get("rationale") or risk.get("description") or "",
        risk_name=risk.get("name", ""),
        risk_description=risk.get("description", ""),
        qa_block=qa_block or "(no QA answers available)",
    )
    raw = respond_json(system=_SYSTEM, user_content=user_content)
    if not isinstance(raw, dict):
        raw = {}

    result: dict = {
        "likelihood":               normalize_label(raw.get("likelihood"),         LIKELIHOOD_LABELS, "Possible"),
        "likelihood_rationale":     str(raw.get("likelihood_rationale",     "")),
        "financial_impact":         normalize_label(raw.get("financial_impact"),   IMPACT_LABELS, "Medium"),
        "financial_rationale":      str(raw.get("financial_rationale",      "")),
        "regulatory_impact":        normalize_label(raw.get("regulatory_impact"),  IMPACT_LABELS, "Medium"),
        "regulatory_rationale":     str(raw.get("regulatory_rationale",     "")),
        "legal_impact":             normalize_label(raw.get("legal_impact"),       IMPACT_LABELS, "Low"),
        "legal_rationale":          str(raw.get("legal_rationale",          "")),
        "customer_impact":          normalize_label(raw.get("customer_impact"),    IMPACT_LABELS, "Medium"),
        "customer_rationale":       str(raw.get("customer_rationale",       "")),
        "reputational_impact":      normalize_label(raw.get("reputational_impact"),IMPACT_LABELS, "Medium"),
        "reputational_rationale":   str(raw.get("reputational_rationale",   "")),
        "inherent_risk_rating_rationale": str(raw.get("inherent_risk_rating_rationale", "")),
    }

    # Numeric scores (1-4) for SMALLINT columns
    result["likelihood_score"]          = SCORE_MAP[result["likelihood"]]
    result["financial_impact_score"]    = IMPACT_SCORE_MAP[result["financial_impact"]]
    result["regulatory_impact_score"]   = IMPACT_SCORE_MAP[result["regulatory_impact"]]
    result["legal_impact_score"]        = IMPACT_SCORE_MAP[result["legal_impact"]]
    result["customer_impact_score"]     = IMPACT_SCORE_MAP[result["customer_impact"]]
    result["reputational_impact_score"] = IMPACT_SCORE_MAP[result["reputational_impact"]]

    # Overall impact = worst-of-five; inherent rating = matrix lookup
    overall_impact = compute_overall_impact(result)
    result["overall_impact"]  = overall_impact
    result["inherent_label"]  = compute_inherent_rating(result["likelihood"], overall_impact)

    return result


# ── Orchestration ─────────────────────────────────────────────────────────────

async def generate_inherent_ratings(assessment_id: str, tenant_id: str) -> dict:
    """Score all applicable risks for *assessment_id* and persist results."""
    snapshot = await get_ao_snapshot(assessment_id, tenant_id)
    if not snapshot:
        raise ValueError(
            "AO snapshot not found. Run POST /ao-overview first."
        )

    ao_summary = snapshot.get("ao_summary") or ""
    au_name    = snapshot.get("au_name") or assessment_id

    chunks   = await select_ao_chunks(assessment_id, tenant_id, top_k=6)
    doc_text = "\n\n-----\n\n".join(chunks) if chunks else ""  # noqa: F841 (available for future use)

    qa_profile   = await get_qa_profile(assessment_id, tenant_id)
    all_responses: list[dict] = (
        list((qa_profile or {}).get("mandatory_responses")   or [])
        + list((qa_profile or {}).get("situational_responses") or [])
    )

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM app.assessment_risks "
            "WHERE assessment_id = %s AND applicable = TRUE",
            (assessment_id,),
        )
        risks = await cur.fetchall()

    scored = 0
    for risk in risks:
        risk_dict    = dict(risk)
        relevant_cats = _get_relevant_cats(risk_dict)
        qa_block      = format_relevant_qa(relevant_cats, all_responses)

        scores = score_single_risk(risk_dict, au_name, ao_summary, qa_block)

        async with get_tenant_cursor(tenant_id) as cur:
            await cur.execute(
                """UPDATE app.assessment_risks
                   SET inherent_likelihood      = %s,
                       inherent_impact          = %s,
                       likelihood_score         = %s,
                       financial_impact         = %s,
                       regulatory_impact        = %s,
                       legal_impact             = %s,
                       customer_impact          = %s,
                       reputational_impact      = %s,
                       likelihood_rationale     = %s,
                       financial_rationale      = %s,
                       regulatory_rationale     = %s,
                       legal_rationale          = %s,
                       customer_rationale       = %s,
                       reputational_rationale   = %s,
                       rationale                = %s
                   WHERE id = %s AND assessment_id = %s""",
                (
                    scores["likelihood"],
                    scores["inherent_label"],
                    scores["likelihood_score"],
                    scores["financial_impact_score"],
                    scores["regulatory_impact_score"],
                    scores["legal_impact_score"],
                    scores["customer_impact_score"],
                    scores["reputational_impact_score"],
                    scores["likelihood_rationale"],
                    scores["financial_rationale"],
                    scores["regulatory_rationale"],
                    scores["legal_rationale"],
                    scores["customer_rationale"],
                    scores["reputational_rationale"],
                    scores["inherent_risk_rating_rationale"],
                    risk_dict["id"],
                    assessment_id,
                ),
            )
        scored += 1
        logger.info(
            "inherent_risk: %s → likelihood=%s overall_impact=%s inherent=%s",
            risk_dict.get("name"), scores["likelihood"],
            scores["overall_impact"], scores["inherent_label"],
        )

    return {
        "assessment_id":   assessment_id,
        "scored":          scored,
        "total_applicable": len(risks),
    }
