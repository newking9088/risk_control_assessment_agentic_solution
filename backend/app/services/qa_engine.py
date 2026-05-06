"""
Step 2 – Two-pass AI questionnaire engine.

Pass 1: answer all mandatory AUP questions using the AU profile + document evidence.
Pass 2: answer triggered situational FRE questions based on Pass-1 yes answers.

Uses evidence-tiered consumption rules (from the spec):
  1. Profile explicitly lists relevant items  → Yes  (assumed, grounded)
  2. Profile empty, vague doc references     → Yes  (assumed, conflict_flagged)
  3. Profile explicitly lists NOT-x          → No   (conservative)
  4. Profile and document both silent        → Yes  (RCSA conservative default — assume exposure exists)
"""

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

import yaml
from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.llm_client import respond_json
from app.services.orchestration import get_ao_snapshot, select_ao_chunks

logger = logging.getLogger(__name__)

_QUESTIONS_PATH = Path(__file__).parent.parent / "config" / "questions.yaml"
_BATCH_SIZE = 20   # questions per LLM call

CONSUMPTION_RULES = (
    "EVIDENCE-TIERED CONSUMPTION RULES:\n"
    "1. Profile EXPLICITLY lists relevant items → answer Yes (assumed=true, grounded)\n"
    "2. Profile empty but vague doc references exist → answer Yes (assumed=true, conflict_flagged=true)\n"
    "3. Profile explicitly lists NOT-x or operations_not_performed → answer No (conservative)\n"
    "4. Profile and document both silent, no negation → answer Yes (assumed=true) "
    "with reason=\"No evidence found; conservative default for RCSA\".\n"
)

_QA_SYSTEM = (
    "You are a fraud-risk assessment specialist. You have a confirmed operational profile of an "
    "Assessment Unit (AU). Answer diagnostic yes/no questions based SOLELY on the confirmed profile "
    "and evidence text provided.\n\n"
    + CONSUMPTION_RULES +
    "\nReturn STRICT JSON — a list with one object per question_id:\n"
    '[\n'
    '  {\n'
    '    "question_id":    "<id>",\n'
    '    "answer":         "yes" | "no",\n'
    '    "assumed":        true | false,\n'
    '    "conflict_flagged": false,\n'
    '    "evidence":       "<1-2 sentence evidence from profile>",\n'
    '    "reason":         "<brief justification>"\n'
    '  }\n'
    ']'
)

_QA_USER = """\
CONFIRMED AU OPERATIONAL PROFILE:
{profile_text}

AU SUMMARY:
{ao_summary}

BUSINESS PROCESS DOCUMENT:
{doc_text}

QUESTIONS TO ANSWER:
{questions_block}
"""


class QuestionDef(TypedDict):
    id: str
    category: str
    text: str
    criteria: str
    triggers_if_yes: list[str]


@lru_cache(maxsize=1)
def _load_questions() -> dict[str, list[QuestionDef]]:
    """Load questions.yaml once, return {"mandatory": [...], "situational": [...]}."""
    with open(_QUESTIONS_PATH, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)

    def _norm(lst: list[dict]) -> list[QuestionDef]:
        out: list[QuestionDef] = []
        for q in lst:
            out.append({
                "id":             q["id"],
                "category":       q.get("category", ""),
                "text":           q["text"],
                "criteria":       str(q.get("criteria", "")),
                "triggers_if_yes": q.get("triggers_if_yes", []),
            })
        return out

    return {
        "mandatory":   _norm(raw.get("mandatory",   [])),
        "situational": _norm(raw.get("situational", [])),
    }


def _profile_to_text(profile: dict) -> str:
    lines: list[str] = []
    for key, vals in profile.items():
        if isinstance(vals, list) and vals:
            lines.append(f"{key.upper().replace('_', ' ')}:")
            for v in vals:
                lines.append(f"  - {v}")
    return "\n".join(lines) or "(no profile data)"


def _batch_questions(questions: list[QuestionDef]) -> list[list[QuestionDef]]:
    return [questions[i:i + _BATCH_SIZE] for i in range(0, len(questions), _BATCH_SIZE)]


def _format_questions_block(batch: list[QuestionDef]) -> str:
    lines: list[str] = []
    for q in batch:
        lines.append(f'Question ID: {q["id"]}')
        lines.append(f'Question:    {q["text"]}')
        lines.append(f'Criteria:    {q["criteria"]}')
        lines.append("")
    return "\n".join(lines).strip()


def _answer_batch(
    batch: list[QuestionDef],
    profile_text: str,
    ao_summary: str,
    doc_text: str = "",
) -> list[dict]:
    user_content = _QA_USER.format(
        profile_text=profile_text,
        ao_summary=ao_summary,
        doc_text=doc_text or "(no document text available)",
        questions_block=_format_questions_block(batch),
    )
    raw = respond_json(system=_QA_SYSTEM, user_content=user_content)

    if isinstance(raw, list):
        return raw

    # Sometimes the LLM wraps the list in a dict
    if isinstance(raw, dict):
        for v in raw.values():
            if isinstance(v, list):
                return v
    return []


def _normalise_response(resp: dict, q: QuestionDef) -> dict:
    return {
        "question_id":     q["id"],
        "question_text":   q["text"],
        "question_type":   "mandatory" if q["id"].startswith("AUP") else "situational",
        "category":        q["category"],
        "answer":          str(resp.get("answer", "no")).lower(),
        "assumed":         bool(resp.get("assumed", True)),
        "conflict_flagged": bool(resp.get("conflict_flagged", False)),
        "evidence":        str(resp.get("evidence", "")),
        "reason":          str(resp.get("reason",   "")),
        "user_corrected":  False,
    }


def _answer_questions(
    questions: list[QuestionDef],
    profile_text: str,
    ao_summary: str,
    doc_text: str = "",
) -> list[dict]:
    """Answer *questions* in batches; return list of normalised response dicts."""
    q_map = {q["id"]: q for q in questions}
    responses: list[dict] = []

    for batch in _batch_questions(questions):
        raw_responses = _answer_batch(batch, profile_text, ao_summary, doc_text)
        answered_ids = set()
        for resp in raw_responses:
            qid = resp.get("question_id", "")
            if qid in q_map:
                responses.append(_normalise_response(resp, q_map[qid]))
                answered_ids.add(qid)

        # Fallback for questions the LLM omitted
        for q in batch:
            if q["id"] not in answered_ids:
                responses.append(_normalise_response({"answer": "no"}, q))

    return responses


def _get_triggered_situational(
    mandatory_responses: list[dict],
    all_situational: list[QuestionDef],
) -> list[QuestionDef]:
    """Return situational questions triggered by any mandatory yes answer."""
    triggered_ids: set[str] = set()
    mandatory_qs = {q["id"]: q for q in _load_questions()["mandatory"]}

    for resp in mandatory_responses:
        if resp.get("answer") == "yes":
            qdef = mandatory_qs.get(resp["question_id"])
            if qdef:
                triggered_ids.update(qdef.get("triggers_if_yes", []))

    sit_map = {q["id"]: q for q in all_situational}
    return [sit_map[qid] for qid in triggered_ids if qid in sit_map]


def _build_exposure_categories(all_responses: list[dict]) -> dict[str, list[str]]:
    """Group yes-answered question IDs by category."""
    categories: dict[str, list[str]] = {}
    for resp in all_responses:
        if resp.get("answer") == "yes":
            cat = resp.get("category", "other")
            categories.setdefault(cat, []).append(resp["question_id"])
    return categories


def _count_responses(all_responses: list[dict]) -> dict[str, int]:
    yes   = sum(1 for r in all_responses if r.get("answer") == "yes")
    no    = sum(1 for r in all_responses if r.get("answer") == "no")
    return {"yes": yes, "no": no, "total": len(all_responses)}


# ── DB helpers ────────────────────────────────────────────────────────────────

async def get_qa_profile(assessment_id: str, tenant_id: str) -> dict | None:
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM app.qa_profiles WHERE assessment_id = %s",
            (assessment_id,),
        )
        return await cur.fetchone()


async def save_qa_profile(assessment_id: str, tenant_id: str, qa: dict) -> None:
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """
            INSERT INTO app.qa_profiles
              (assessment_id, tenant_id,
               mandatory_responses, situational_responses, exposure_categories, counters)
            VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
            ON CONFLICT (assessment_id) DO UPDATE SET
              mandatory_responses   = EXCLUDED.mandatory_responses,
              situational_responses = EXCLUDED.situational_responses,
              exposure_categories   = EXCLUDED.exposure_categories,
              counters              = EXCLUDED.counters,
              updated_at            = now()
            """,
            (
                assessment_id,
                tenant_id,
                json.dumps(qa["mandatory_responses"]),
                json.dumps(qa["situational_responses"]),
                json.dumps(qa["exposure_categories"]),
                json.dumps(qa["counters"]),
            ),
        )


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_qa_engine(assessment_id: str, tenant_id: str) -> dict:
    """
    Run the two-pass QA engine for *assessment_id*.

    Returns the full qa_profile dict with answers + rationale in the shape
    expected by the frontend questionnaire component.

    Raises ValueError if no AO snapshot exists yet.
    """
    snapshot = await get_ao_snapshot(assessment_id, tenant_id)
    if not snapshot:
        raise ValueError(
            "AO snapshot not found. Run POST /ao-overview first to generate the assessment overview."
        )

    profile_text = _profile_to_text(snapshot.get("operational_profile") or {})
    ao_summary   = snapshot.get("ao_summary") or ""

    # Fetch document chunks so the LLM has full business process context
    chunks   = await select_ao_chunks(assessment_id, tenant_id, top_k=6)
    doc_text = "\n\n-----\n\n".join(chunks) if chunks else ""

    qs = _load_questions()
    mandatory_qs   = qs["mandatory"]
    situational_all = qs["situational"]

    # Pass 1 — mandatory AUP questions
    mandatory_responses = _answer_questions(mandatory_qs, profile_text, ao_summary, doc_text)

    # Pass 2 — situational FRE questions triggered by mandatory Yes answers
    triggered_qs = _get_triggered_situational(mandatory_responses, situational_all)
    situational_responses: list[dict] = []
    if triggered_qs:
        situational_responses = _answer_questions(triggered_qs, profile_text, ao_summary, doc_text)

    all_responses = mandatory_responses + situational_responses

    # Build flat answers + rationale maps (matches frontend data model)
    answers:   dict[str, str] = {r["question_id"]: r["answer"]   for r in all_responses}
    rationale: dict[str, str] = {r["question_id"]: r["evidence"] for r in all_responses}

    qa_profile = {
        "mandatory_responses":   mandatory_responses,
        "situational_responses": situational_responses,
        "exposure_categories":   _build_exposure_categories(all_responses),
        "counters":              _count_responses(all_responses),
        "answers":               answers,
        "rationale":             rationale,
    }

    await save_qa_profile(assessment_id, tenant_id, qa_profile)
    return qa_profile
