"""
Step 2 – Questionnaire routes.

POST  /api/v1/assessments/{id}/qa-run      – run two-pass AI QA engine
GET   /api/v1/assessments/{id}/qa-answers  – retrieve current QA profile
PUT   /api/v1/assessments/{id}/qa-answers  – apply user correction to one answer
"""

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config.constants import DEFAULT_TENANT_ID
from app.infra.db import get_tenant_cursor
from app.services.qa_engine import run_qa_engine, get_qa_profile, save_qa_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/assessments", tags=["questionnaire"])


def _tenant(request: Request) -> str:
    return request.state.user.get("tenantId", DEFAULT_TENANT_ID)


# ── POST /qa-run ──────────────────────────────────────────────────────────────

@router.post("/{assessment_id}/qa-run")
async def run_questionnaire(assessment_id: str, request: Request):
    """
    Run the two-pass AI QA engine.

    Pass 1: answer all mandatory AUP questions.
    Pass 2: answer situational FRE questions triggered by Pass-1 yes answers.

    Returns answers + rationale in the format the frontend questionnaire expects.
    """
    tenant_id = _tenant(request)
    try:
        qa_profile = await run_qa_engine(assessment_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("QA run failed for %s: %s", assessment_id, exc)
        raise HTTPException(status_code=500, detail="QA engine failed. Please retry.")
    return qa_profile


# ── GET /qa-answers ───────────────────────────────────────────────────────────

@router.get("/{assessment_id}/qa-answers")
async def get_answers(assessment_id: str, request: Request):
    """
    Return the saved QA profile (answers + rationale + exposure_categories + counters).
    Returns 404 if the QA engine has not been run yet.
    """
    tenant_id = _tenant(request)
    profile = await get_qa_profile(assessment_id, tenant_id)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail="No QA profile found. Run POST /qa-run first.",
        )

    # Enrich with flat answers/rationale maps for frontend compatibility
    mandatory   = profile.get("mandatory_responses")   or []
    situational = profile.get("situational_responses") or []
    all_resp    = (mandatory if isinstance(mandatory, list) else []) + \
                  (situational if isinstance(situational, list) else [])

    return {
        **profile,
        "answers":   {r["question_id"]: r["answer"]   for r in all_resp},
        "rationale": {r["question_id"]: r["evidence"] for r in all_resp},
    }


# ── PUT /qa-answers ───────────────────────────────────────────────────────────

class AnswerCorrection(BaseModel):
    question_id: str
    answer: str       # "yes" | "no"
    rationale: str = ""


@router.put("/{assessment_id}/qa-answers")
async def correct_answer(
    assessment_id: str,
    request: Request,
    correction: AnswerCorrection,
):
    """
    Apply a user correction to a single question's answer.

    Marks the response as user_corrected=True and updates evidence with the
    supplied rationale.  Rebuilds exposure_categories and counters.
    """
    if correction.answer not in ("yes", "no"):
        raise HTTPException(status_code=422, detail="answer must be 'yes' or 'no'")

    tenant_id = _tenant(request)
    profile = await get_qa_profile(assessment_id, tenant_id)
    if not profile:
        raise HTTPException(status_code=404, detail="No QA profile found.")

    mandatory   = list(profile.get("mandatory_responses")   or [])
    situational = list(profile.get("situational_responses") or [])

    updated = False
    for resp_list in (mandatory, situational):
        for resp in resp_list:
            if resp.get("question_id") == correction.question_id:
                resp["answer"]         = correction.answer
                resp["user_corrected"] = True
                resp["assumed"]        = False
                if correction.rationale:
                    resp["evidence"]   = correction.rationale
                updated = True

    if not updated:
        raise HTTPException(
            status_code=404,
            detail=f"Question {correction.question_id!r} not found in QA profile.",
        )

    # Rebuild exposure_categories and counters
    all_resp = mandatory + situational

    def _build_exposure(resps: list[dict]) -> dict[str, list[str]]:
        cats: dict[str, list[str]] = {}
        for r in resps:
            if r.get("answer") == "yes":
                cat = r.get("category", "other")
                cats.setdefault(cat, []).append(r["question_id"])
        return cats

    def _count(resps: list[dict]) -> dict[str, int]:
        yes = sum(1 for r in resps if r.get("answer") == "yes")
        no  = sum(1 for r in resps if r.get("answer") == "no")
        return {"yes": yes, "no": no, "total": len(resps)}

    updated_profile = {
        "mandatory_responses":   mandatory,
        "situational_responses": situational,
        "exposure_categories":   _build_exposure(all_resp),
        "counters":              _count(all_resp),
    }

    await save_qa_profile(assessment_id, tenant_id, updated_profile)

    return {
        **updated_profile,
        "answers":   {r["question_id"]: r["answer"]   for r in all_resp},
        "rationale": {r["question_id"]: r["evidence"] for r in all_resp},
    }
