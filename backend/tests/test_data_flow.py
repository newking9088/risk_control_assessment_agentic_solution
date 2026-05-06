"""
Data-flow integration tests — verify that output written by each step
is correctly consumed by the downstream step.

Step 1 → 2 : ao_snapshot.{ao_summary, operational_profile} feed qa_engine LLM prompt
Step 2 → 3 : qa_profile.{mandatory,situational}_responses feed applicability + guardrail
Step 3 → 4 : assessment_risks WHERE applicable=TRUE only enter inherent scoring
Step 4 → 6 : inherent_impact column (set by Step 4) feeds residual matrix
Step 5 → 6 : overall_effectiveness column (set by Step 5) feeds residual matrix
End-to-end : Steps 4 → 6 chained with mocked DB; residual_impact is a valid label
"""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from app.services.qa_engine import run_qa_engine
from app.services.risk_applicability import process_applicability
from app.services.inherent_risk import generate_inherent_ratings
from app.services.controls_effectiveness import evaluate_all_controls
from app.services.residual_risk import compute_residual_ratings, compute_residual_risk

# ── IDs ───────────────────────────────────────────────────────────────────────
ASSESS  = "aaaaaaaa-0000-0000-0000-000000000001"
TENANT  = "tttttttt-0000-0000-0000-000000000001"
RISK_ID = "rrrrrrrr-0000-0000-0000-000000000001"
CTRL_ID = "cccccccc-0000-0000-0000-000000000001"

# ── Fixtures ──────────────────────────────────────────────────────────────────

_SNAPSHOT = {
    "assessment_id":       ASSESS,
    "ao_summary":          "Digital retail banking AU processing online wire transfers.",
    "operational_profile": {
        "channels":         ["Online Banking", "Mobile App"],
        "products_handled": ["Credit Card", "Wire Transfer"],
    },
    "au_name":       "Test AU",
    "fraud_surface": {},
}

_QA_PROFILE = {
    "mandatory_responses": [
        {"question_id": "AUP-010", "category": "transaction_payment",
         "answer": "yes", "question_text": "Initiates payments?", "evidence": "ACH processed."},
    ],
    "situational_responses": [
        {"question_id": "FRE-014", "category": "transaction_payment",
         "answer": "yes", "question_text": "Outgoing wire?", "evidence": "Wire transfers."},
    ],
    "answers":   {"AUP-010": "yes", "FRE-014": "yes"},
    "rationale": {"AUP-010": "ACH processed.", "FRE-014": "Wire transfers."},
}

_RISK = {
    "id": RISK_ID, "assessment_id": ASSESS,
    "name": "Payment Fraud", "category": "External Fraud",
    "l1": "External Fraud", "source": "EXT",
    "description": "Fraudulent payment transactions.",
    "applicable": True,
    "inherent_impact": "High", "inherent_likelihood": "Likely",
    "rationale": "Risk that fraud may occur.",
}

_CONTROL = {
    "id": CTRL_ID, "assessment_id": ASSESS, "risk_id": RISK_ID,
    "name": "Velocity Check", "type": "Automated",
    "description": "Rate-limits transactions.",
    "overall_effectiveness": "Moderately Effective",
    "risk_name": "Payment Fraud",
    "risk_description": "Fraudulent payment transactions.",
}

_INHERENT_LLM = {
    "likelihood": "Likely",
    "likelihood_rationale": "High transaction volume.",
    "financial_impact": "High", "financial_rationale": "Significant losses.",
    "regulatory_impact": "Medium", "regulatory_rationale": "Moderate fines.",
    "legal_impact": "Low", "legal_rationale": "Minimal exposure.",
    "customer_impact": "Medium", "customer_rationale": "Limited harm.",
    "reputational_impact": "Medium", "reputational_rationale": "Moderate coverage.",
    "inherent_risk_rating_rationale": "Likely + High → High inherent.",
}


# ── Mock helpers ──────────────────────────────────────────────────────────────

class _SmartCursor:
    """
    Mock cursor that routes fetchall/fetchone results by matching the last
    executed SQL against registered keyword handlers.
    UPDATEs/INSERTs are captured in self.updates for assertion.
    """

    def __init__(self):
        self.sql_log: list[str]       = []
        self.updates: list[tuple]     = []
        self._routes: list[tuple]     = []

    def when(self, keyword: str, result):
        """Return *result* from fetchall/fetchone when last SQL contains *keyword*."""
        self._routes.append((keyword.lower(), result))

    async def execute(self, sql: str, params=None):
        self.sql_log.append(sql)
        if sql.strip().upper().startswith(("UPDATE", "INSERT")):
            self.updates.append((sql, params or ()))

    async def fetchall(self) -> list:
        last = (self.sql_log[-1] if self.sql_log else "").lower()
        for kw, result in self._routes:
            if kw in last:
                return list(result) if isinstance(result, list) else []
        return []

    async def fetchone(self):
        last = (self.sql_log[-1] if self.sql_log else "").lower()
        for kw, result in self._routes:
            if kw in last:
                return result[0] if isinstance(result, list) and result else result
        return None

    def sql_contains(self, fragment: str) -> bool:
        """True if *fragment* appears (case-insensitive) in any executed SQL."""
        return any(fragment.lower() in s.lower() for s in self.sql_log)

    def update_params_for(self, table: str) -> list[tuple]:
        """Return parameter tuples for UPDATEs whose SQL mentions *table*."""
        return [p for s, p in self.updates if table.lower() in s.lower()]


def _ctx(cur: _SmartCursor):
    """Return a get_tenant_cursor side_effect that always yields *cur*."""
    @asynccontextmanager
    async def _inner(*args, **kwargs):
        yield cur
    return _inner


# ═══════════════════════════════════════════════════════════════════════════════
# Step 1 → Step 2
# ═══════════════════════════════════════════════════════════════════════════════

class TestStep1ToStep2:
    """ao_snapshot written by Step 1 must feed qa_engine (Step 2)."""

    @pytest.mark.asyncio
    async def test_step2_raises_if_snapshot_missing(self):
        """run_qa_engine requires an ao_snapshot — raises ValueError when absent."""
        with patch("app.services.qa_engine.get_ao_snapshot",
                   new=AsyncMock(return_value=None)):
            with pytest.raises(ValueError, match="AO snapshot"):
                await run_qa_engine(ASSESS, TENANT)

    @pytest.mark.asyncio
    async def test_step2_embeds_ao_summary_in_llm_prompt(self):
        """ao_summary from the Step 1 snapshot is injected verbatim into the Step 2 LLM prompt."""
        captured: list[str] = []

        def _capture(system, user_content):
            captured.append(user_content)
            # Return a minimal valid batch response
            return [{"question_id": "AUP-010", "answer": "yes", "assumed": True,
                     "conflict_flagged": False, "evidence": "e", "reason": "r"}]

        cur = _SmartCursor()
        with patch("app.services.qa_engine.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.qa_engine.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.qa_engine.get_tenant_cursor", side_effect=_ctx(cur)), \
             patch("app.services.qa_engine.respond_json", side_effect=_capture):
            await run_qa_engine(ASSESS, TENANT)

        assert captured, "respond_json was never called — ao_snapshot may not be reaching qa_engine"
        combined = "\n".join(captured)
        assert _SNAPSHOT["ao_summary"] in combined, (
            f"ao_summary not found in LLM prompt.\n"
            f"Expected: {_SNAPSHOT['ao_summary']!r}\n"
            f"Got prompts: {combined[:300]}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Step 2 → Step 3
# ═══════════════════════════════════════════════════════════════════════════════

class TestStep2ToStep3:
    """qa_profile written by Step 2 must feed risk applicability (Step 3)."""

    @pytest.mark.asyncio
    async def test_step3_raises_if_qa_profile_missing(self):
        """process_applicability requires a qa_profile — raises ValueError when absent."""
        cur = _SmartCursor()
        cur.when("assessment_risks", [])
        with patch("app.services.risk_applicability.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.risk_applicability.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.risk_applicability.get_qa_profile",
                   new=AsyncMock(return_value=None)), \
             patch("app.services.risk_applicability.get_tenant_cursor", side_effect=_ctx(cur)):
            with pytest.raises(ValueError, match="QA profile"):
                await process_applicability(ASSESS, TENANT)

    @pytest.mark.asyncio
    async def test_step3_mandatory_and_situational_responses_both_feed_guardrail(self):
        """
        Both mandatory_responses and situational_responses from Step 2 are combined.
        LLM says 'not applicable' but 2 yes answers across both lists
        (AUP-010 mandatory + FRE-014 situational, both category=transaction_payment)
        trigger requires_review=True — proving both lists are consumed.
        """
        cur = _SmartCursor()
        cur.when("assessment_risks", [dict(_RISK, applicable=None)])

        with patch("app.services.risk_applicability.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.risk_applicability.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.risk_applicability.get_qa_profile",
                   new=AsyncMock(return_value=_QA_PROFILE)), \
             patch("app.services.risk_applicability.get_tenant_cursor", side_effect=_ctx(cur)), \
             patch("app.services.risk_applicability.respond_json",
                   return_value={"applicable": False, "evidence": "", "reason": ""}):
            result = await process_applicability(ASSESS, TENANT)

        assert result["requires_review"] == 1, (
            "Expected requires_review=1 when LLM says no but 2 relevant yes answers exist"
        )
        # Verify requires_review=True is in the UPDATE params (index 5)
        update_params = cur.update_params_for("assessment_risks")
        assert update_params, "No UPDATE executed on assessment_risks"
        assert update_params[0][5] is True, (
            f"UPDATE param[5] (requires_review) should be True, got {update_params[0][5]}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Step 3 → Step 4
# ═══════════════════════════════════════════════════════════════════════════════

class TestStep3ToStep4:
    """Only applicable=TRUE risks from Step 3 flow into inherent scoring (Step 4)."""

    @pytest.mark.asyncio
    async def test_step4_sql_filters_applicable_true(self):
        """generate_inherent_ratings SELECT must filter by applicable = TRUE."""
        cur = _SmartCursor()
        cur.when("assessment_risks", [])   # no risks — just need the SQL captured

        with patch("app.services.inherent_risk.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.inherent_risk.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.inherent_risk.get_qa_profile",
                   new=AsyncMock(return_value=_QA_PROFILE)), \
             patch("app.services.inherent_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            result = await generate_inherent_ratings(ASSESS, TENANT)

        assert result["scored"] == 0
        assert cur.sql_contains("applicable = TRUE"), (
            "Step 4 SELECT must include 'applicable = TRUE' to skip non-applicable risks.\n"
            "SQL log:\n" + "\n".join(cur.sql_log)
        )

    @pytest.mark.asyncio
    async def test_step4_writes_inherent_likelihood_and_impact_columns(self):
        """
        generate_inherent_ratings must SET inherent_likelihood and inherent_impact
        — these are the columns consumed by Step 6.
        """
        cur = _SmartCursor()
        cur.when("assessment_risks", [dict(_RISK, inherent_impact=None)])

        with patch("app.services.inherent_risk.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.inherent_risk.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.inherent_risk.get_qa_profile",
                   new=AsyncMock(return_value=_QA_PROFILE)), \
             patch("app.services.inherent_risk.get_tenant_cursor", side_effect=_ctx(cur)), \
             patch("app.services.inherent_risk.respond_json", return_value=_INHERENT_LLM):
            result = await generate_inherent_ratings(ASSESS, TENANT)

        assert result["scored"] == 1
        assert cur.sql_contains("inherent_likelihood"), \
            "Step 4 UPDATE must SET inherent_likelihood"
        assert cur.sql_contains("inherent_impact"), \
            "Step 4 UPDATE must SET inherent_impact"

        # Verify the UPDATE params (consumed verbatim by Step 6)
        params = cur.update_params_for("assessment_risks")[0]
        assert params[0] in ("Unlikely", "Possible", "Likely", "Almost Certain"), \
            f"params[0] (inherent_likelihood) out of range: {params[0]}"
        assert params[1] in ("Low", "Medium", "High", "Very High"), \
            f"params[1] (inherent_impact/inherent_label) out of range: {params[1]}"
        assert isinstance(params[2], int) and 1 <= params[2] <= 4, \
            f"params[2] (likelihood_score SMALLINT) must be 1-4, got {params[2]}"

    @pytest.mark.asyncio
    async def test_step4_skips_non_applicable_risk(self):
        """
        If no applicable risks exist the scored count is 0 and no UPDATE is executed.
        Simulates a risk that was marked applicable=False by Step 3 and therefore
        filtered out by Step 4's WHERE clause.
        """
        cur = _SmartCursor()
        cur.when("assessment_risks", [])   # Step 3 set applicable=False; SQL filters it out

        with patch("app.services.inherent_risk.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.inherent_risk.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.inherent_risk.get_qa_profile",
                   new=AsyncMock(return_value=_QA_PROFILE)), \
             patch("app.services.inherent_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            result = await generate_inherent_ratings(ASSESS, TENANT)

        assert result["scored"] == 0
        assert not cur.updates, "UPDATE should not execute when no applicable risks"


# ═══════════════════════════════════════════════════════════════════════════════
# Step 4 → Step 6
# ═══════════════════════════════════════════════════════════════════════════════

class TestStep4ToStep6:
    """inherent_impact set by Step 4 feeds the residual matrix in Step 6."""

    @pytest.mark.asyncio
    async def test_step6_sql_selects_inherent_impact_column(self):
        """compute_residual_ratings must SELECT inherent_impact from assessment_risks."""
        cur = _SmartCursor()
        cur.when("assessment_risks", [])
        cur.when("assessment_controls", [])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            await compute_residual_ratings(ASSESS, TENANT)

        assert cur.sql_contains("inherent_impact"), (
            "Step 6 SELECT must include inherent_impact (written by Step 4)"
        )

    @pytest.mark.asyncio
    async def test_step6_filters_out_risks_without_inherent_impact(self):
        """
        Risks where inherent_impact IS NULL (Step 4 not yet run) are skipped.
        The WHERE clause must include 'inherent_impact IS NOT NULL'.
        """
        cur = _SmartCursor()
        cur.when("assessment_risks", [])   # empty: filtered by inherent_impact IS NOT NULL
        cur.when("assessment_controls", [])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            result = await compute_residual_ratings(ASSESS, TENANT)

        assert result["computed"] == 0
        assert cur.sql_contains("inherent_impact is not null"), (
            "Step 6 must filter 'inherent_impact IS NOT NULL' to skip un-scored risks"
        )

    @pytest.mark.asyncio
    async def test_step6_high_inherent_no_controls_defaults_ce_to_moderately_effective(self):
        """
        inherent_impact='High' from Step 4, no controls mapped (Step 5 not run yet or no controls).
        CE defaults to 'Moderately Effective'.
        RESIDUAL_MATRIX['Moderately Effective'][2] = 'High'.
        residual_likelihood must mirror inherent_likelihood.
        """
        cur = _SmartCursor()
        cur.when("assessment_risks", [_RISK])   # inherent_impact="High", likelihood="Likely"
        cur.when("assessment_controls", [])      # no controls → default CE

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            result = await compute_residual_ratings(ASSESS, TENANT)

        assert result["computed"] == 1
        params = cur.update_params_for("assessment_risks")[0]
        assert params[0] == "High", (
            f"inherent=High + CE=Moderately Effective → residual should be 'High', got '{params[0]}'"
        )
        assert params[1] == "Likely", (
            f"residual_likelihood should mirror inherent_likelihood 'Likely', got '{params[1]}'"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Step 5 → Step 6
# ═══════════════════════════════════════════════════════════════════════════════

class TestStep5ToStep6:
    """overall_effectiveness set by Step 5 feeds the residual matrix in Step 6."""

    @pytest.mark.asyncio
    async def test_step6_sql_selects_overall_effectiveness_from_controls(self):
        """compute_residual_ratings must SELECT overall_effectiveness from assessment_controls."""
        cur = _SmartCursor()
        cur.when("assessment_risks", [])
        cur.when("assessment_controls", [])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            await compute_residual_ratings(ASSESS, TENANT)

        assert cur.sql_contains("overall_effectiveness"), (
            "Step 6 must SELECT overall_effectiveness (written by Step 5)"
        )

    @pytest.mark.asyncio
    async def test_step5_sql_left_joins_assessment_risks_for_context(self):
        """
        evaluate_all_controls must LEFT JOIN assessment_risks to pull
        risk_name and risk_description — data written by Step 3 —
        for use in the Step 5 LLM prompt.
        """
        cur = _SmartCursor()
        cur.when("assessment_controls", [_CONTROL])

        with patch("app.services.orchestration.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.controls_effectiveness.get_tenant_cursor",
                   side_effect=_ctx(cur)), \
             patch("app.services.controls_effectiveness.respond_json",
                   return_value={"design_effectiveness": "Effective",
                                 "operating_effectiveness": "Effective",
                                 "overall_effectiveness": "Effective",
                                 "rationale": "Well designed."}):
            await evaluate_all_controls(ASSESS, TENANT)

        assert cur.sql_contains("left join"), (
            "Step 5 SELECT must LEFT JOIN assessment_risks to consume Step 3 risk context"
        )

    @pytest.mark.asyncio
    async def test_step5_writes_overall_effectiveness_for_step6(self):
        """
        evaluate_all_controls UPDATE must SET overall_effectiveness (TEXT label)
        — the column consumed by Step 6's residual matrix lookup.
        """
        cur = _SmartCursor()
        cur.when("assessment_controls", [_CONTROL])

        with patch("app.services.orchestration.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.controls_effectiveness.get_tenant_cursor",
                   side_effect=_ctx(cur)), \
             patch("app.services.controls_effectiveness.respond_json",
                   return_value={"design_effectiveness": "Effective",
                                 "operating_effectiveness": "Moderately Effective",
                                 "overall_effectiveness": "Moderately Effective",
                                 "rationale": "Partial coverage."}):
            result = await evaluate_all_controls(ASSESS, TENANT)

        assert result["controls_scored"] == 1
        assert cur.sql_contains("overall_effectiveness"), \
            "Step 5 UPDATE must SET overall_effectiveness"

        params = cur.update_params_for("assessment_controls")[0]
        # params: (design_eff_score, operating_eff_score, overall_eff_text, rationale, id, assessment_id)
        assert params[2] == "Moderately Effective", (
            f"Step 5 wrote overall_effectiveness={params[2]!r}, expected 'Moderately Effective'"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# End-to-End Pipeline (Steps 4 → 5 → 6)
# ═══════════════════════════════════════════════════════════════════════════════

class TestEndToEndPipeline:
    """
    Simulate the full Step 4 → 5 → 6 chain with mocked DB.
    Verify that each step's writes become the next step's reads,
    and the final residual_impact matches the expected matrix value.
    """

    @pytest.mark.asyncio
    async def test_effective_ce_reduces_very_high_inherent_to_high(self):
        """
        Step 4 writes inherent_impact='Very High'.
        Step 5 writes overall_effectiveness='Effective'.
        Step 6: RESIDUAL_MATRIX['Effective'][3] = 'High'.
        """
        risk = dict(_RISK, inherent_impact="Very High", inherent_likelihood="Almost Certain")
        ctrl = dict(_CONTROL, overall_effectiveness="Effective")

        cur = _SmartCursor()
        cur.when("assessment_risks", [risk])
        cur.when("assessment_controls", [ctrl])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            result = await compute_residual_ratings(ASSESS, TENANT)

        assert result["computed"] == 1
        params = cur.update_params_for("assessment_risks")[0]
        assert params[0] == "High", (
            f"Very High inherent + Effective CE → residual='High', got '{params[0]}'"
        )

    @pytest.mark.asyncio
    async def test_ineffective_ce_preserves_very_high_residual(self):
        """
        Step 5 writes overall_effectiveness='Ineffective'.
        Step 6: RESIDUAL_MATRIX['Ineffective'][3] = 'Very High' (no reduction).
        """
        risk = dict(_RISK, inherent_impact="Very High", inherent_likelihood="Almost Certain")
        ctrl = dict(_CONTROL, overall_effectiveness="Ineffective")

        cur = _SmartCursor()
        cur.when("assessment_risks", [risk])
        cur.when("assessment_controls", [ctrl])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            result = await compute_residual_ratings(ASSESS, TENANT)

        assert result["computed"] == 1
        params = cur.update_params_for("assessment_risks")[0]
        assert params[0] == "Very High", (
            f"Very High inherent + Ineffective CE → residual='Very High', got '{params[0]}'"
        )

    @pytest.mark.asyncio
    async def test_worst_of_multiple_controls_drives_residual(self):
        """
        When multiple controls exist (written by Step 5), Step 6 uses the worst CE.
        Three controls: Effective, Ineffective, Moderately Effective → worst = Ineffective.
        inherent_impact='Medium' + Ineffective → RESIDUAL_MATRIX['Ineffective'][1] = 'High'.
        """
        risk = dict(_RISK, inherent_impact="Medium", inherent_likelihood="Possible")
        controls = [
            {"risk_id": RISK_ID, "overall_effectiveness": "Effective"},
            {"risk_id": RISK_ID, "overall_effectiveness": "Ineffective"},
            {"risk_id": RISK_ID, "overall_effectiveness": "Moderately Effective"},
        ]

        cur = _SmartCursor()
        cur.when("assessment_risks", [risk])
        cur.when("assessment_controls", controls)

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            await compute_residual_ratings(ASSESS, TENANT)

        params = cur.update_params_for("assessment_risks")[0]
        assert params[0] == "High", (
            f"Medium inherent + worst CE=Ineffective → residual='High', got '{params[0]}'"
        )

    @pytest.mark.asyncio
    async def test_residual_likelihood_mirrors_inherent_likelihood(self):
        """
        residual_likelihood must mirror inherent_likelihood — controls reduce impact
        but not event frequency. Verifies the Step 4 → Step 6 likelihood propagation.
        """
        risk = dict(_RISK, inherent_impact="Low", inherent_likelihood="Almost Certain")

        cur = _SmartCursor()
        cur.when("assessment_risks", [risk])
        cur.when("assessment_controls", [])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(cur)):
            await compute_residual_ratings(ASSESS, TENANT)

        params = cur.update_params_for("assessment_risks")[0]
        # params: (residual_impact, residual_likelihood, risk_id, assessment_id)
        assert params[1] == "Almost Certain", (
            f"residual_likelihood must mirror inherent_likelihood 'Almost Certain', got '{params[1]}'"
        )

    @pytest.mark.asyncio
    async def test_full_step4_to_step6_chain_produces_valid_residual(self):
        """
        Full Step 4 → Step 6 chain with mocked DB and LLM.

        Step 4: LLM scores likelihood=Likely + financial/regulatory/etc High →
                inherent_label = INHERENT_MATRIX[High][Likely] = 'High'
        Step 6: Uses that inherent_impact='High' + CE='Effective' →
                residual = RESIDUAL_MATRIX['Effective']['High'] = 'Medium'
        """
        # ── Step 4: generate_inherent_ratings ────────────────────────────────
        s4_cur = _SmartCursor()
        s4_cur.when("assessment_risks", [dict(_RISK, inherent_impact=None)])

        with patch("app.services.inherent_risk.get_ao_snapshot",
                   new=AsyncMock(return_value=_SNAPSHOT)), \
             patch("app.services.inherent_risk.select_ao_chunks",
                   new=AsyncMock(return_value=[])), \
             patch("app.services.inherent_risk.get_qa_profile",
                   new=AsyncMock(return_value=_QA_PROFILE)), \
             patch("app.services.inherent_risk.get_tenant_cursor", side_effect=_ctx(s4_cur)), \
             patch("app.services.inherent_risk.respond_json", return_value=_INHERENT_LLM):
            s4 = await generate_inherent_ratings(ASSESS, TENANT)

        assert s4["scored"] == 1
        s4_params = s4_cur.update_params_for("assessment_risks")[0]
        inherent_likelihood = s4_params[0]   # e.g. "Likely"
        inherent_impact     = s4_params[1]   # e.g. "High" (matrix result)

        assert inherent_impact in ("Low", "Medium", "High", "Very High"), \
            f"Step 4 wrote unexpected inherent_impact: {inherent_impact}"

        # ── Step 6: compute_residual_ratings ─────────────────────────────────
        # Feed Step 4's output into the mock DB for Step 6
        scored_risk = dict(_RISK, inherent_impact=inherent_impact,
                           inherent_likelihood=inherent_likelihood)
        # CE='Effective' (simulates Step 5 output)
        ctrl_with_ce = {"risk_id": RISK_ID, "overall_effectiveness": "Effective"}

        s6_cur = _SmartCursor()
        s6_cur.when("assessment_risks", [scored_risk])
        s6_cur.when("assessment_controls", [ctrl_with_ce])

        with patch("app.services.residual_risk.get_tenant_cursor", side_effect=_ctx(s6_cur)):
            s6 = await compute_residual_ratings(ASSESS, TENANT)

        assert s6["computed"] == 1
        s6_params = s6_cur.update_params_for("assessment_risks")[0]
        residual_impact     = s6_params[0]
        residual_likelihood = s6_params[1]

        # Validate against the pure matrix function (source of truth)
        expected_residual = compute_residual_risk(inherent_impact, "Effective")
        assert residual_impact == expected_residual, (
            f"residual mismatch: inherent={inherent_impact}, CE=Effective, "
            f"expected={expected_residual}, got={residual_impact}"
        )
        assert residual_likelihood == inherent_likelihood, (
            "residual_likelihood must mirror inherent_likelihood across the pipeline"
        )
