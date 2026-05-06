"""
4 unit tests for app/services/controls_effectiveness.py

TestAggregateRiskCE (2)
TestEvaluateControl (2)
"""
from unittest.mock import patch

from app.services.controls_effectiveness import (
    EFF_SCORE,
    aggregate_risk_ce,
    evaluate_control,
)


# ── TestAggregateRiskCE ───────────────────────────────────────────────────────

class TestAggregateRiskCE:
    def test_single_control_returns_its_label(self):
        controls = [{"overall_effectiveness": "Effective"}]
        assert aggregate_risk_ce(controls) == "Effective"

    def test_no_controls_returns_none(self):
        assert aggregate_risk_ce([]) is None

    def test_worst_wins(self):
        controls = [
            {"overall_effectiveness": "Effective"},
            {"overall_effectiveness": "Ineffective"},
            {"overall_effectiveness": "Moderately Effective"},
        ]
        assert aggregate_risk_ce(controls) == "Ineffective"

    def test_moderately_effective_is_middle(self):
        controls = [
            {"overall_effectiveness": "Effective"},
            {"overall_effectiveness": "Moderately Effective"},
        ]
        assert aggregate_risk_ce(controls) == "Moderately Effective"


# ── TestEvaluateControl ───────────────────────────────────────────────────────

class TestEvaluateControl:
    def test_llm_scores_are_normalised(self):
        mock_response = {
            "design_effectiveness": "effective",
            "operating_effectiveness": "Moderately Effective",
            "overall_effectiveness": "Moderately Effective",
            "rationale": "Partial coverage.",
        }
        with patch("app.services.controls_effectiveness.respond_json", return_value=mock_response):
            result = evaluate_control(
                {"name": "Velocity Check", "type": "Automated", "description": "Rate limits."},
                {"name": "Payment Fraud", "description": "Fraud via payments."},
                "Digital banking AU.",
            )
        assert result["design_effectiveness"] == "Effective"
        assert result["overall_effectiveness"] == "Moderately Effective"
        assert result["overall_effectiveness_score"] == EFF_SCORE["Moderately Effective"]

    def test_llm_failure_defaults_to_moderately_effective(self):
        with patch("app.services.controls_effectiveness.respond_json", return_value={}):
            result = evaluate_control(
                {"name": "Check", "type": "Manual", "description": "Manual review."},
                {"name": "Fraud", "description": "Fraud risk."},
                "AU summary.",
            )
        assert result["design_effectiveness"] == "Moderately Effective"
        assert result["operating_effectiveness"] == "Moderately Effective"
        assert result["overall_effectiveness"] == "Moderately Effective"
