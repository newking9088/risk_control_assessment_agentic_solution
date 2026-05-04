"""
End-to-end tests for Step 2 questionnaire routes.

LLM calls are mocked.  Tests hit the real DB.
"""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_TENANT_ID, TEST_USER_ID

ASSESSMENT_ID = str(uuid.uuid4())

_SNAPSHOT = {
    "assessment_id": ASSESSMENT_ID,
    "tenant_id": TEST_TENANT_ID,
    "snapshot_version": "1.0",
    "ao_summary": "A credit card call centre.",
    "ao_display": {},
    "operational_profile": {
        "operations_performed": ["handle customer calls"],
        "operations_not_performed": [],
        "systems": ["CRM"],
        "channels": ["phone"],
        "employee_capabilities": ["view account balances"],
        "populations_served": ["retail customers"],
        "products_handled": ["credit cards"],
        "data_types_processed": ["PII"],
        "third_party_involvement": [],
        "regulatory_environment": ["CFPB"],
    },
    "fraud_surface": {},
    "user_edited": False,
}

# Minimal realistic LLM answer batch for mandatory questions
_MOCK_MANDATORY = [
    {"question_id": "AUP-001", "answer": "yes",  "assumed": True,  "conflict_flagged": False,
     "evidence": "Unit serves retail consumers.", "reason": "Profile: populations_served includes retail."},
    {"question_id": "AUP-002", "answer": "no",   "assumed": False, "conflict_flagged": False,
     "evidence": "No commercial customers in profile.", "reason": "Not mentioned."},
    {"question_id": "AUP-006", "answer": "yes",  "assumed": True,  "conflict_flagged": False,
     "evidence": "Call centre services existing accounts.", "reason": "Operations performed."},
    {"question_id": "AUP-008", "answer": "yes",  "assumed": True,  "conflict_flagged": False,
     "evidence": "Products include credit cards.", "reason": "Profile: products_handled."},
    {"question_id": "AUP-027", "answer": "yes",  "assumed": True,  "conflict_flagged": False,
     "evidence": "Employees view account balances.", "reason": "Profile: employee_capabilities."},
]

# Minimal situational answers
_MOCK_SITUATIONAL = [
    {"question_id": "FRE-007", "answer": "yes", "assumed": True, "conflict_flagged": False,
     "evidence": "Agents retrieve account data on behalf of customers.", "reason": "Channel=phone."},
    {"question_id": "FRE-057", "answer": "yes", "assumed": True, "conflict_flagged": False,
     "evidence": "Employees can view PII.", "reason": "data_types_processed: PII."},
]


def _patch_qa_llm(mandatory=None, situational=None):
    """Patch _answer_batch to return pre-canned responses."""
    mandatory  = mandatory  or _MOCK_MANDATORY
    situational = situational or _MOCK_SITUATIONAL
    call_count = {"n": 0}

    def _side_effect(batch, profile_text, ao_summary):
        call_count["n"] += 1
        qids = {q["id"] for q in batch}
        # Return mandatory or situational canned answers depending on which batch is sent
        if any(q.startswith("AUP") for q in qids):
            return [r for r in mandatory if r["question_id"] in qids]
        return [r for r in situational if r["question_id"] in qids]

    return patch(
        "app.services.qa_engine._answer_batch",
        side_effect=_side_effect,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _seed_assessment_and_snapshot(db_conn):
    import asyncio

    async def _setup():
        await db_conn.execute(
            """
            INSERT INTO app.assessments (id, tenant_id, title, status, current_step, created_by)
            VALUES (%s, %s, 'QA Test Assessment', 'draft', 2, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (ASSESSMENT_ID, TEST_TENANT_ID, TEST_USER_ID),
        )
        # Seed a snapshot so qo-run can find it
        await db_conn.execute(
            """
            INSERT INTO app.ao_snapshots
              (assessment_id, tenant_id, snapshot_version, ao_summary,
               ao_display, operational_profile, fraud_surface)
            VALUES (%s, %s, '1.0', %s, '{}'::jsonb, %s::jsonb, '{}'::jsonb)
            ON CONFLICT (assessment_id) DO NOTHING
            """,
            (
                ASSESSMENT_ID,
                TEST_TENANT_ID,
                _SNAPSHOT["ao_summary"],
                json.dumps(_SNAPSHOT["operational_profile"]),
            ),
        )
        await db_conn.commit()

    asyncio.get_event_loop().run_until_complete(_setup())


# ─────────────────────────────────────────────────────────────────────────────
# Tests: POST /qo-run
# ─────────────────────────────────────────────────────────────────────────────

class TestQoRun:
    def test_run_returns_answers_dict(self, test_client: TestClient):
        with _patch_qa_llm():
            resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "answers" in body
        assert "rationale" in body
        assert "exposure_categories" in body
        assert "counters" in body
        assert body["counters"]["total"] > 0

    def test_run_yes_no_counts_match(self, test_client: TestClient):
        with _patch_qa_llm():
            resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        body = resp.json()
        yes = body["counters"]["yes"]
        no  = body["counters"]["no"]
        total = body["counters"]["total"]
        assert yes + no == total

    def test_run_answers_include_mandatory_ids(self, test_client: TestClient):
        with _patch_qa_llm():
            resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        answers = resp.json()["answers"]
        assert "AUP-001" in answers

    def test_run_no_snapshot_returns_422(self, test_client: TestClient):
        empty_id = str(uuid.uuid4())
        with _patch_qa_llm():
            resp = test_client.post(f"/api/v1/assessments/{empty_id}/qo-run")
        assert resp.status_code == 422

    def test_run_triggers_situational_questions(self, test_client: TestClient):
        """AUP-006=yes and AUP-027=yes should trigger FRE-007 and FRE-057."""
        with _patch_qa_llm():
            resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        answers = resp.json()["answers"]
        # Situational triggered by AUP-006=yes → FRE-007
        assert "FRE-007" in answers

    def test_run_exposure_categories_populated(self, test_client: TestClient):
        with _patch_qa_llm():
            resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        cats = resp.json()["exposure_categories"]
        # At least entity_customer should be present (AUP-001=yes)
        assert "entity_customer" in cats


# ─────────────────────────────────────────────────────────────────────────────
# Tests: GET /qo-answers
# ─────────────────────────────────────────────────────────────────────────────

class TestGetQoAnswers:
    def test_get_answers_after_run(self, test_client: TestClient):
        with _patch_qa_llm():
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")

        resp = test_client.get(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-answers")
        assert resp.status_code == 200
        body = resp.json()
        assert "answers" in body
        assert isinstance(body["answers"], dict)

    def test_get_answers_not_found(self, test_client: TestClient):
        resp = test_client.get(f"/api/v1/assessments/{uuid.uuid4()}/qo-answers")
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Tests: PUT /qo-answers (user correction)
# ─────────────────────────────────────────────────────────────────────────────

class TestCorrectAnswer:
    def test_correct_answer_updates_value(self, test_client: TestClient):
        with _patch_qa_llm():
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")

        # AUP-002 was answered "no" — flip to "yes"
        resp = test_client.put(
            f"/api/v1/assessments/{ASSESSMENT_ID}/qo-answers",
            json={"question_id": "AUP-002", "answer": "yes", "rationale": "Actually yes."},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["answers"]["AUP-002"] == "yes"
        assert body["rationale"]["AUP-002"] == "Actually yes."

    def test_correct_answer_invalid_value(self, test_client: TestClient):
        with _patch_qa_llm():
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        resp = test_client.put(
            f"/api/v1/assessments/{ASSESSMENT_ID}/qo-answers",
            json={"question_id": "AUP-001", "answer": "maybe"},
        )
        assert resp.status_code == 422

    def test_correct_unknown_question_returns_404(self, test_client: TestClient):
        with _patch_qa_llm():
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        resp = test_client.put(
            f"/api/v1/assessments/{ASSESSMENT_ID}/qo-answers",
            json={"question_id": "AUP-999", "answer": "yes"},
        )
        assert resp.status_code == 404

    def test_correct_answer_not_found_profile(self, test_client: TestClient):
        resp = test_client.put(
            f"/api/v1/assessments/{uuid.uuid4()}/qo-answers",
            json={"question_id": "AUP-001", "answer": "yes"},
        )
        assert resp.status_code == 404

    def test_correct_answer_recalculates_counters(self, test_client: TestClient):
        with _patch_qa_llm():
            run_resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/qo-run")
        original_yes = run_resp.json()["counters"]["yes"]

        # Flip AUP-002 from no → yes
        resp = test_client.put(
            f"/api/v1/assessments/{ASSESSMENT_ID}/qo-answers",
            json={"question_id": "AUP-002", "answer": "yes"},
        )
        assert resp.status_code == 200
        assert resp.json()["counters"]["yes"] == original_yes + 1
