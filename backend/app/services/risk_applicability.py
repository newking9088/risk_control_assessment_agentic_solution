"""
Risk Applicability Engine — Step 3.

For each risk in the assessment:
  1. Identify relevant QA categories via CATEGORY_MAP (keyed by fraud nature).
  2. Count relevant "yes" QA answers.
  3. Ask the LLM: applicable or not, with evidence and reason.
  4. Deterministic guardrail: LLM says No but ≥2 relevant Yes → requires_review=True.
  5. Generate a one-sentence risk statement.
  6. Compute confidence score (qa_driven or fallback).
  7. Persist results back to app.assessment_risks.
"""

import logging

from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.llm_client import respond_json
from app.services.orchestration import get_ao_snapshot, select_ao_chunks
from app.services.qa_engine import get_qa_profile

logger = logging.getLogger(__name__)

# ── Category map ──────────────────────────────────────────────────────────────
# Maps fraud nature ("external" | "insider") to the QA question categories
# that are relevant for evaluating applicability of risks of that nature.

CATEGORY_MAP: dict[str, list[str]] = {
    "external": [
        "entity_customer",
        "product_service",
        "channel",
        "auth_access",
        "transaction_payment",
        "credit_application",
        "dispute_claim",
        "card_physical",
        "digital_technical",
        "customer_behavior",
    ],
    "insider": [
        "employee_access",
        "employee_internal",
        "transaction_payment",
        "auth_access",
    ],
}

# ── LLM prompts ───────────────────────────────────────────────────────────────

_APPLICABILITY_SYSTEM = (
    "You are a fraud risk specialist evaluating whether a specific fraud risk applies to an "
    "Assessment Unit (AU) based on its operational profile and questionnaire answers.\n\n"
    "Return STRICT JSON (no markdown):\n"
    '{\n'
    '  "applicable": true | false,\n'
    '  "evidence": "<1-2 sentences from profile or QA answers supporting the decision>",\n'
    '  "reason": "<brief justification>"\n'
    '}'
)

_APPLICABILITY_USER = """\
RISK TO EVALUATE:
Name: {risk_name}
Description: {risk_description}
Category: {risk_category}

AU OPERATIONAL PROFILE:
{profile_text}

AU SUMMARY:
{ao_summary}

BUSINESS PROCESS DOCUMENT:
{doc_text}

RELEVANT QA ANSWERS:
{qa_block}

Based on the above, is this fraud risk applicable to this assessment unit?
"""

_STATEMENT_SYSTEM = """\
You are writing AU-level risk statements for a fraud RCSA.
MANDATORY STRUCTURE – follow exactly:
"Risk that [RISK EVENT] [ATTACK VECTOR(S)], given that [VULNERABILITY CONTEXT], \
resulting in [IMPACT], in the absence of controls."

Where:
A. RISK EVENT – what may happen (e.g., "unauthorized wire transfers may be initiated")
B. ATTACK VECTOR – how it happens, through what channel/mechanism
C. VULNERABILITY CONTEXT – why this specific AU is exposed (reference AU capabilities)
D. IMPACT – downstream consequences (financial losses, regulatory exposure, etc.)

RULES:
- 1-2 sentences, 60-90 words max, absolute maximum 180 words
- MUST begin with "Risk that"
- MUST end with ", in the absence of controls."
- MUST follow the 4-part structure above
- Reference the AU's specific operations, not generic descriptions
- Do NOT mention controls, monitoring, or mitigations in the body
- Do NOT use dramatic adjectives (catastrophic, severe, devastating)
- Return ONLY JSON: { "statement": "..." }
"""

_STATEMENT_USER = """\
ASSESSMENT UNIT: {au_name}
AU SUMMARY: {ao_summary}
AU KEY CAPABILITIES: {profile_text}
RISK NAME: {risk_name}
RISK DESCRIPTION: {risk_description}
APPLICABILITY EVIDENCE: {evidence}

Generate the risk statement following the mandatory 4-part structure:
A. RISK EVENT – what fraudulent event may occur
B. ATTACK VECTOR – through which of the AU's specific operations/channels
C. VULNERABILITY CONTEXT – why this AU is exposed (cite specific AU capabilities)
D. IMPACT – financial, operational, or regulatory consequences
"""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _profile_to_text(profile: dict) -> str:
    lines: list[str] = []
    for key, vals in profile.items():
        if isinstance(vals, list) and vals:
            lines.append(f"{key.upper().replace('_', ' ')}:")
            for v in vals:
                lines.append(f"  - {v}")
    return "\n".join(lines) or "(no profile data)"


def _get_relevant_cats(risk: dict) -> list[str]:
    """Map a risk to the relevant QA categories using its fraud nature."""
    from app.utils.risk_scope import classify_fraud_nature
    nature = classify_fraud_nature(
        risk.get("l1", "") or "",
        risk.get("category", "") or "",
        risk.get("source", "") or "",
    )
    if nature in CATEGORY_MAP:
        return CATEGORY_MAP[nature]
    # Unknown nature: use union of all categories
    return list({cat for cats in CATEGORY_MAP.values() for cat in cats})


# ── Public helpers ────────────────────────────────────────────────────────────

def format_relevant_qa(relevant_cats: list[str], all_responses: list[dict]) -> str:
    """Format QA responses for the given categories as a readable block."""
    lines: list[str] = []
    for resp in all_responses:
        if resp.get("category") in relevant_cats:
            qid = resp.get("question_id", "")
            answer = str(resp.get("answer", "")).upper()
            text = resp.get("question_text", "")
            evidence = resp.get("evidence", "")
            lines.append(f"[{answer}] {qid}: {text}")
            if evidence:
                lines.append(f"       Evidence: {evidence}")
    return "\n".join(lines) if lines else "(no relevant QA answers)"


def count_relevant_yes(relevant_cats: list[str], all_responses: list[dict]) -> int:
    """Count QA questions in relevant_cats that were answered yes."""
    return sum(
        1 for r in all_responses
        if r.get("category") in relevant_cats and r.get("answer") == "yes"
    )


def evaluate_risk_applicability(
    risk: dict,
    profile_text: str,
    ao_summary: str,
    doc_text: str,
    qa_answers: dict[str, str],
    qa_rationale: dict[str, str],
    all_responses: list[dict],
) -> dict:
    """Return {'applicable', 'evidence', 'reason', 'requires_review'} for one risk."""
    relevant_cats = _get_relevant_cats(risk)
    qa_block = format_relevant_qa(relevant_cats, all_responses)
    relevant_yes_count = count_relevant_yes(relevant_cats, all_responses)

    user_content = _APPLICABILITY_USER.format(
        risk_name=risk.get("name", ""),
        risk_description=risk.get("description", ""),
        risk_category=risk.get("category", ""),
        profile_text=profile_text,
        ao_summary=ao_summary,
        doc_text=doc_text or "(no document text available)",
        qa_block=qa_block,
    )

    raw = respond_json(system=_APPLICABILITY_SYSTEM, user_content=user_content)

    if isinstance(raw, dict):
        applicable = bool(raw.get("applicable", True))
        evidence = str(raw.get("evidence", ""))
        reason = str(raw.get("reason", ""))
    else:
        applicable = True
        evidence = ""
        reason = ""

    # Guardrail: LLM says No but ≥2 relevant Yes answers → flag for human review
    requires_review = not applicable and relevant_yes_count >= 2

    return {
        "applicable": applicable,
        "evidence": evidence,
        "reason": reason,
        "requires_review": requires_review,
    }


def generate_risk_statement(
    risk: dict,
    au_name: str,
    is_applicable: bool,
    profile_text: str = "",
    ao_summary: str = "",
    evidence: str = "",
) -> str:
    """
    Return an FRA-style risk statement.

    Not-applicable: fully deterministic — no LLM call.
    Applicable: LLM produces the strict 4-part template, then validated and
    corrected if needed.  Falls back to a deterministic 4-part sentence when
    the LLM returns empty output or exceeds 180 words.
    """
    risk_name = risk.get("name", "this risk")
    risk_description = risk.get("description", risk_name)

    # ── Not-applicable: deterministic, matches FRA exactly ────────────────────
    if not is_applicable:
        return (
            f"Based on the business activities of {au_name}, "
            f"the risk of {risk_name} is not applicable."
        )

    # ── Applicable: LLM with strict 4-part structure ──────────────────────────
    fallback = (
        f"Risk that {risk_description} may occur through {au_name}'s operations, "
        f"given that the assessment unit {ao_summary or 'processes relevant transactions'}, "
        f"resulting in potential financial or operational losses, "
        f"in the absence of controls."
    )

    user_content = _STATEMENT_USER.format(
        au_name=au_name,
        ao_summary=ao_summary or "(not available)",
        profile_text=profile_text or "(not available)",
        risk_name=risk_name,
        risk_description=risk_description,
        evidence=evidence or "(not available)",
    )

    try:
        raw = respond_json(system=_STATEMENT_SYSTEM, user_content=user_content)
        stmt = ""
        if isinstance(raw, dict):
            stmt = str(raw.get("statement", "")).strip()

        if not stmt:
            return fallback

        # Enforce "Risk that" prefix
        if not stmt.lower().startswith("risk that"):
            stmt = "Risk that " + stmt[0].lower() + stmt[1:]

        # Enforce ", in the absence of controls." suffix
        if not stmt.rstrip().lower().endswith("in the absence of controls."):
            stmt = stmt.rstrip().rstrip(".") + ", in the absence of controls."

        # Word-count cap
        if len(stmt.split()) > 180:
            return fallback

        return stmt

    except Exception:
        return fallback


def compute_confidence(
    is_applicable: bool,
    relevant_cats: list[str],
    all_responses: list[dict],
) -> tuple[float, str, str]:
    """Return (score 0.0–1.0, label 'high'|'medium'|'low', source)."""
    if not all_responses:
        return (0.5, "low", "no_qa_data")

    relevant = [r for r in all_responses if r.get("category") in relevant_cats]
    if not relevant:
        return (0.5, "low", "no_relevant_qa")

    yes_count = sum(1 for r in relevant if r.get("answer") == "yes")
    ratio = yes_count / len(relevant)

    if is_applicable:
        if ratio >= 0.6:
            return (round(min(0.95, 0.6 + ratio * 0.35), 2), "high", "qa_driven")
        if ratio >= 0.3:
            return (round(0.4 + ratio * 0.4, 2), "medium", "qa_driven")
        return (round(0.1 + ratio * 0.6, 2), "low", "qa_driven")
    else:
        inv = 1.0 - ratio
        if inv >= 0.7:
            return (round(min(0.9, 0.5 + inv * 0.4), 2), "high", "qa_driven")
        if inv >= 0.4:
            return (round(0.3 + inv * 0.4, 2), "medium", "qa_driven")
        return (round(0.1 + inv * 0.3, 2), "low", "qa_driven")


# ── Orchestration ─────────────────────────────────────────────────────────────

async def process_applicability(assessment_id: str, tenant_id: str) -> dict:
    """
    Evaluate applicability for every risk attached to *assessment_id*.

    Requires the AO snapshot (POST /ao-overview) and QA profile (POST /qa-run)
    to have been generated first.  Updates app.assessment_risks in-place and
    returns a summary dict.
    """
    snapshot = await get_ao_snapshot(assessment_id, tenant_id)
    if not snapshot:
        raise ValueError(
            "AO snapshot not found. Run POST /ao-overview first to generate the assessment overview."
        )

    profile_text = _profile_to_text(snapshot.get("operational_profile") or {})
    ao_summary = snapshot.get("ao_summary") or ""
    au_name = snapshot.get("au_name") or assessment_id

    chunks = await select_ao_chunks(assessment_id, tenant_id, top_k=6)
    doc_text = "\n\n-----\n\n".join(chunks) if chunks else ""

    qa_profile = await get_qa_profile(assessment_id, tenant_id)
    if not qa_profile:
        raise ValueError(
            "QA profile not found. Run POST /qa-run first to generate questionnaire answers."
        )

    qa_answers: dict[str, str] = qa_profile.get("answers") or {}
    qa_rationale: dict[str, str] = qa_profile.get("rationale") or {}
    all_responses: list[dict] = (
        list(qa_profile.get("mandatory_responses") or [])
        + list(qa_profile.get("situational_responses") or [])
    )

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM app.assessment_risks WHERE assessment_id = %s",
            (assessment_id,),
        )
        risks = await cur.fetchall()

    applicable_count = 0
    not_applicable_count = 0
    review_count = 0

    for risk in risks:
        risk_dict = dict(risk)
        result = evaluate_risk_applicability(
            risk_dict, profile_text, ao_summary, doc_text,
            qa_answers, qa_rationale, all_responses,
        )

        relevant_cats = _get_relevant_cats(risk_dict)
        confidence, label, source = compute_confidence(
            result["applicable"], relevant_cats, all_responses,
        )

        statement = generate_risk_statement(
            risk_dict, au_name, result["applicable"],
            profile_text=profile_text,
            ao_summary=ao_summary,
            evidence=result.get("evidence", ""),
        )

        if result["applicable"]:
            applicable_count += 1
        else:
            not_applicable_count += 1
        if result["requires_review"]:
            review_count += 1

        async with get_tenant_cursor(tenant_id) as cur:
            await cur.execute(
                """UPDATE app.assessment_risks
                   SET applicable             = %s,
                       rationale              = %s,
                       applicability_confidence = %s,
                       confidence_label       = %s,
                       decision_basis         = %s,
                       requires_review        = %s
                   WHERE id = %s AND assessment_id = %s""",
                (
                    result["applicable"],
                    statement,
                    confidence,
                    label,
                    source,
                    result["requires_review"],
                    risk_dict["id"],
                    assessment_id,
                ),
            )
        logger.info(
            "risk_applicability: %s → applicable=%s confidence=%s",
            risk_dict.get("name", risk_dict["id"]),
            result["applicable"],
            label,
        )

    return {
        "assessment_id": assessment_id,
        "total":          len(risks),
        "applicable":     applicable_count,
        "not_applicable": not_applicable_count,
        "requires_review": review_count,
    }
