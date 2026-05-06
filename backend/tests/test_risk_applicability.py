"""
15 unit tests for app/services/risk_applicability.py

TestCategoryMap (2)
TestEvaluateRiskApplicability (3)
TestGenerateRiskStatement (3)
TestComputeConfidence (4)
TestProcessApplicability (3)
"""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from app.services.risk_applicability import (
    CATEGORY_MAP,
    compute_confidence,
    count_relevant_yes,
    evaluate_risk_applicability,
    format_relevant_qa,
    generate_risk_statement,
    process_applicability,
)


# ── Fixtures / helpers ────────────────────────────────────────────────────────

def _resp(qid: str, cat: str, answer: str, text: str = "", evidence: str = "") -> dict:
    return {
        "question_id": qid,
        "category": cat,
        "answer": answer,
        "question_text": text,
        "evidence": evidence,
    }


def _mock_responses(yes_count: int, total: int, cats: list[str]) -> list[dict]:
    responses = []
    for i in range(total):
        cat = cats[i % len(cats)]
        responses.append(_resp(f"Q-{i:02d}", cat, "yes" if i < yes_count else "no"))
    return responses


_SAMPLE_RISK = {
    "id": "r-001",
    "name": "Payment Fraud",
    "category": "External Fraud",
    "l1": "External Fraud",
    "source": "EXT",
    "description": "Fraudulent payment transactions.",
}

_INSIDER_RISK = {
    "id": "r-002",
    "name": "Employee Data Theft",
    "category": "Insider Threat",
    "l1": "Insider Threat",
    "source": "INT",
    "description": "Employees exfiltrating customer PII.",
}


# ── TestCategoryMap ───────────────────────────────────────────────────────────

class TestCategoryMap:
    def test_external_has_required_categories(self):
        ext = CATEGORY_MAP["external"]
        for cat in ("transaction_payment", "auth_access", "digital_technical",
                    "credit_application", "dispute_claim", "customer_behavior"):
            assert cat in ext, f"Expected '{cat}' in CATEGORY_MAP['external']"

    def test_insider_has_required_categories(self):
        ins = CATEGORY_MAP["insider"]
        for cat in ("employee_access", "employee_internal", "transaction_payment", "auth_access"):
            assert cat in ins, f"Expected '{cat}' in CATEGORY_MAP['insider']"


# ── TestEvaluateRiskApplicability ─────────────────────────────────────────────

class TestEvaluateRiskApplicability:
    _PROFILE = "CHANNELS:\n  - Online Banking\nPRODUCTS:\n  - Credit Card"
    _SUMMARY = "Digital retail banking AU."
    _RESPONSES = [
        _resp("AUP-010", "product_service", "yes", "Initiates payments?"),
        _resp("FRE-014", "transaction_payment", "yes", "Outgoing payments?"),
        _resp("FRE-017", "transaction_payment", "yes", "ACH/wire?"),
        _resp("AUP-007", "product_service", "no", "Deposit accounts?"),
    ]

    def test_llm_applicable_true(self):
        with patch("app.services.risk_applicability.respond_json",
                   return_value={"applicable": True, "evidence": "AU processes payments.", "reason": "High exposure."}):
            result = evaluate_risk_applicability(
                _SAMPLE_RISK, self._PROFILE, self._SUMMARY, "",
                {}, {}, self._RESPONSES,
            )
        assert result["applicable"] is True
        assert result["requires_review"] is False
        assert "evidence" in result

    def test_llm_applicable_false_with_no_yes(self):
        """LLM says no, and there are < 2 relevant yes answers → no review flag."""
        responses = [_resp("FRE-014", "transaction_payment", "no")]
        with patch("app.services.risk_applicability.respond_json",
                   return_value={"applicable": False, "evidence": "No payments.", "reason": "Not exposed."}):
            result = evaluate_risk_applicability(
                _SAMPLE_RISK, self._PROFILE, self._SUMMARY, "",
                {}, {}, responses,
            )
        assert result["applicable"] is False
        assert result["requires_review"] is False

    def test_llm_not_applicable_but_many_yes_triggers_review(self):
        """LLM says no, but ≥2 relevant yes answers → requires_review=True."""
        responses = [
            _resp("FRE-014", "transaction_payment", "yes"),
            _resp("FRE-017", "transaction_payment", "yes"),
            _resp("FRE-018", "transaction_payment", "yes"),
        ]
        with patch("app.services.risk_applicability.respond_json",
                   return_value={"applicable": False, "evidence": "", "reason": ""}):
            result = evaluate_risk_applicability(
                _SAMPLE_RISK, self._PROFILE, self._SUMMARY, "",
                {}, {}, responses,
            )
        assert result["applicable"] is False
        assert result["requires_review"] is True


# ── TestGenerateRiskStatement ─────────────────────────────────────────────────

class TestGenerateRiskStatement:
    _GOOD_STMT = (
        "Risk that external actors may initiate fraudulent payment transfers "
        "through the AU's online and phone channels, given that agents process "
        "fund transfer requests on behalf of customers, resulting in financial "
        "losses from unauthorized transactions, in the absence of controls."
    )

    def test_not_applicable_is_deterministic_no_llm(self):
        """Not-applicable returns exact FRA template without any LLM call."""
        stmt = generate_risk_statement(_SAMPLE_RISK, "Consumer Contact Center", False)
        assert stmt == (
            "Based on the business activities of Consumer Contact Center, "
            "the risk of Payment Fraud is not applicable."
        )

    def test_applicable_returns_4_part_structure(self):
        """Applicable: LLM output is validated to start/end with FRA markers."""
        with patch("app.services.risk_applicability.respond_json",
                   return_value={"statement": self._GOOD_STMT}):
            stmt = generate_risk_statement(_SAMPLE_RISK, "Test AU", True,
                                           ao_summary="Handles payments.")
        assert stmt.startswith("Risk that")
        assert stmt.rstrip().endswith("in the absence of controls.")

    def test_llm_failure_falls_back_to_4_part_template(self):
        """If respond_json raises, the fallback is also a valid 4-part statement."""
        with patch("app.services.risk_applicability.respond_json",
                   side_effect=RuntimeError("LLM down")):
            stmt = generate_risk_statement(_SAMPLE_RISK, "Test AU", True,
                                           ao_summary="Handles payments.")
        assert stmt.startswith("Risk that")
        assert stmt.rstrip().endswith("in the absence of controls.")


# ── TestComputeConfidence ─────────────────────────────────────────────────────

class TestComputeConfidence:
    _CATS = ["transaction_payment", "auth_access"]

    def test_high_confidence_applicable(self):
        responses = _mock_responses(yes_count=7, total=9, cats=self._CATS)
        score, label, source = compute_confidence(True, self._CATS, responses)
        assert label == "high"
        assert score >= 0.6
        assert source == "qa_driven"

    def test_medium_confidence_applicable(self):
        responses = _mock_responses(yes_count=3, total=8, cats=self._CATS)
        score, label, source = compute_confidence(True, self._CATS, responses)
        assert label == "medium"
        assert 0.3 <= score < 0.8

    def test_low_confidence_applicable(self):
        responses = _mock_responses(yes_count=1, total=8, cats=self._CATS)
        score, label, source = compute_confidence(True, self._CATS, responses)
        assert label == "low"

    def test_empty_responses_returns_low(self):
        score, label, source = compute_confidence(True, self._CATS, [])
        assert score == 0.5
        assert label == "low"
        assert source == "no_qa_data"


# ── TestProcessApplicability ──────────────────────────────────────────────────

class TestProcessApplicability:
    _SNAPSHOT = {"operational_profile": {}, "ao_summary": "Retail banking.", "au_name": "Test AU"}
    _QA_PROFILE = {
        "answers": {"AUP-010": "yes"},
        "rationale": {},
        "mandatory_responses": [
            _resp("AUP-010", "product_service", "yes", "Initiates payments?"),
        ],
        "situational_responses": [],
    }
    _RISKS = [
        {"id": "r-001", "name": "Payment Fraud", "category": "External Fraud",
         "l1": "External Fraud", "source": "EXT", "description": "Fraudulent payments."},
    ]

    @pytest.mark.asyncio
    async def test_no_snapshot_raises_value_error(self):
        with patch("app.services.risk_applicability.get_ao_snapshot",
                   new=AsyncMock(return_value=None)):
            with pytest.raises(ValueError, match="AO snapshot"):
                await process_applicability("test-id", "tenant-1")

    @pytest.mark.asyncio
    async def test_no_qa_profile_raises_value_error(self):
        with patch("app.services.risk_applicability.get_ao_snapshot",
                   new=AsyncMock(return_value=self._SNAPSHOT)), \
             patch("app.services.risk_applicability.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.risk_applicability.get_qa_profile",
                   new=AsyncMock(return_value=None)):
            with pytest.raises(ValueError, match="QA profile"):
                await process_applicability("test-id", "tenant-1")

    @pytest.mark.asyncio
    async def test_returns_summary_dict_with_expected_keys(self):
        risks_data = list(self._RISKS)

        class _Cursor:
            async def execute(self, sql, params=None):
                pass
            async def fetchall(self):
                return risks_data
            async def fetchone(self):
                return None

        @asynccontextmanager
        async def _fake_ctx(*args, **kwargs):
            yield _Cursor()

        with patch("app.services.risk_applicability.get_ao_snapshot",
                   new=AsyncMock(return_value=self._SNAPSHOT)), \
             patch("app.services.risk_applicability.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.risk_applicability.get_qa_profile",
                   new=AsyncMock(return_value=self._QA_PROFILE)), \
             patch("app.services.risk_applicability.get_tenant_cursor",
                   side_effect=_fake_ctx), \
             patch("app.services.risk_applicability.respond_json",
                   return_value={"applicable": True, "evidence": "Evidence.", "reason": "Reason.",
                                 "statement": "Risk that fraud may occur, given exposure, resulting in losses, in the absence of controls."}):
            result = await process_applicability("test-id", "tenant-1")

        assert result["assessment_id"] == "test-id"
        assert result["total"] == 1
        assert "applicable" in result
        assert "not_applicable" in result
        assert "requires_review" in result
        assert result["applicable"] + result["not_applicable"] == result["total"]
