"""
6 unit tests for app/services/inherent_risk.py

TestNormalizeLabel (3)
TestComputeOverallImpact (1)
TestInherentRating (2)
"""
from unittest.mock import patch

import pytest

from app.services.inherent_risk import (
    IMPACT_LABELS,
    LIKELIHOOD_LABELS,
    compute_inherent_rating,
    compute_overall_impact,
    normalize_label,
    score_single_risk,
)


# ── TestNormalizeLabel ────────────────────────────────────────────────────────

class TestNormalizeLabel:
    def test_exact_match(self):
        assert normalize_label("Possible", LIKELIHOOD_LABELS, "Unlikely") == "Possible"

    def test_case_insensitive(self):
        assert normalize_label("very high", IMPACT_LABELS, "Low") == "Very High"

    def test_fallback_on_unrecognised(self):
        assert normalize_label("extreme", IMPACT_LABELS, "Medium") == "Medium"


# ── TestComputeOverallImpact ──────────────────────────────────────────────────

class TestComputeOverallImpact:
    def test_worst_of_five(self):
        scores = {
            "financial_impact":   "Low",
            "regulatory_impact":  "Medium",
            "legal_impact":       "Low",
            "customer_impact":    "High",
            "reputational_impact": "Medium",
        }
        assert compute_overall_impact(scores) == "High"


# ── TestInherentRating ────────────────────────────────────────────────────────

class TestInherentRating:
    def test_matrix_lookup(self):
        # High impact (row 2), Likely (col 2) → "High"
        assert compute_inherent_rating("Likely", "High") == "High"

    def test_score_single_risk_with_mock_llm(self):
        mock_response = {
            "likelihood": "Likely",
            "likelihood_rationale": "Transactions processed daily.",
            "financial_impact": "High",
            "financial_rationale": "Significant losses possible.",
            "regulatory_impact": "Medium",
            "regulatory_rationale": "Moderate fines expected.",
            "legal_impact": "Low",
            "legal_rationale": "Minimal legal exposure.",
            "customer_impact": "Medium",
            "customer_rationale": "Limited customer harm.",
            "reputational_impact": "Medium",
            "reputational_rationale": "Moderate media coverage.",
            "inherent_risk_rating_rationale": "Likely due to volume; High financial impact.",
        }
        with patch("app.services.inherent_risk.respond_json", return_value=mock_response):
            result = score_single_risk(
                {"name": "Payment Fraud", "description": "Fraudulent payments."},
                "Test AU", "Digital banking AU.", "QA: yes answers here.",
            )
        assert result["likelihood"] == "Likely"
        assert result["likelihood_score"] == 3
        assert result["overall_impact"] == "High"
        assert result["inherent_label"] in ("Low", "Medium", "High", "Very High")
