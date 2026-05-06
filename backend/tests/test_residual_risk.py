"""
5 unit tests for app/services/residual_risk.py

TestComputeResidualRisk (5)
"""
import pytest

from app.services.residual_risk import (
    INHERENT_LABELS,
    RESIDUAL_MATRIX,
    compute_residual_risk,
)


class TestComputeResidualRisk:
    def test_ineffective_preserves_very_high(self):
        assert compute_residual_risk("Very High", "Ineffective") == "Very High"

    def test_effective_reduces_very_high_to_high(self):
        assert compute_residual_risk("Very High", "Effective") == "High"

    def test_effective_low_stays_low(self):
        assert compute_residual_risk("Low", "Effective") == "Low"

    def test_unrecognised_inherent_returns_none(self):
        assert compute_residual_risk("Critical", "Effective") is None

    def test_full_matrix_coverage(self):
        for ce_label, row in RESIDUAL_MATRIX.items():
            for idx, inherent_label in enumerate(INHERENT_LABELS):
                result = compute_residual_risk(inherent_label, ce_label)
                assert result == row[idx], (
                    f"Matrix mismatch: ce={ce_label}, inherent={inherent_label}, "
                    f"expected={row[idx]}, got={result}"
                )
