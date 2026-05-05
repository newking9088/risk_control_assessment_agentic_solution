import pytest
from app.utils.risk_scope import classify_fraud_nature, risk_matches_scope


class TestClassifyFraudNature:
    def test_l1_external_fraud(self):
        assert classify_fraud_nature("External Fraud", "", "") == "external"

    def test_l1_insider_threat(self):
        assert classify_fraud_nature("Insider Threat", "", "") == "insider"

    def test_l1_internal_insider_fraud(self):
        assert classify_fraud_nature("Internal/Insider Fraud", "", "") == "insider"

    def test_l1_internal_fraud_risk(self):
        assert classify_fraud_nature("Internal Fraud Risk", "", "") == "insider"

    def test_l1_first_party_fraud(self):
        assert classify_fraud_nature("First-Party Fraud", "", "") == "external"

    def test_l1_third_party_fraud(self):
        assert classify_fraud_nature("Third-Party Fraud", "", "") == "external"

    def test_category_external_fraud_fallback(self):
        assert classify_fraud_nature("", "External Fraud", "") == "external"

    def test_category_insider_threat_fallback(self):
        assert classify_fraud_nature("", "Insider Threat", "") == "insider"

    def test_source_ext_fallback(self):
        assert classify_fraud_nature("", "", "EXT") == "external"

    def test_all_empty_returns_unknown(self):
        assert classify_fraud_nature("", "", "") == "unknown"

    def test_case_insensitive(self):
        assert classify_fraud_nature("EXTERNAL FRAUD", "", "") == "external"
        assert classify_fraud_nature("INSIDER threat", "", "") == "insider"


class TestRiskMatchScope:
    def test_scope_both_always_true(self):
        assert risk_matches_scope({"l1": "External Fraud"}, "both") is True

    def test_scope_empty_string_always_true(self):
        assert risk_matches_scope({"l1": "External Fraud"}, "") is True

    def test_scope_none_always_true(self):
        assert risk_matches_scope({"l1": "Insider Threat"}, None) is True

    def test_internal_scope_rejects_external_risk(self):
        assert risk_matches_scope({"l1": "External Fraud"}, "internal") is False

    def test_internal_scope_accepts_insider_risk(self):
        assert risk_matches_scope({"l1": "Insider Threat"}, "internal") is True

    def test_internal_scope_accepts_unknown_risk(self):
        assert risk_matches_scope({"l1": "", "category": "", "source": ""}, "internal") is True

    def test_external_scope_rejects_insider_risk(self):
        assert risk_matches_scope({"l1": "Insider Threat"}, "external") is False

    def test_external_scope_accepts_external_risk(self):
        assert risk_matches_scope({"l1": "External Fraud"}, "external") is True

    def test_external_scope_accepts_unknown_risk(self):
        assert risk_matches_scope({"l1": "", "category": "", "source": ""}, "external") is True

    def test_ngc_taxonomy_risk_matches_external_not_internal(self):
        risk = {"l1": "External Fraud", "source": "NGC"}
        assert risk_matches_scope(risk, "external") is True
        assert risk_matches_scope(risk, "internal") is False

    def test_int_source_matches_internal_not_external(self):
        risk = {"l1": "", "category": "", "source": "INT"}
        assert risk_matches_scope(risk, "internal") is True
        assert risk_matches_scope(risk, "external") is False
