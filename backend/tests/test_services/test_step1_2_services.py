"""
Unit tests for the Step 1 & 2 service layer.
No DB or LLM calls — all external dependencies are mocked/stubbed.
"""

import pytest
from unittest.mock import patch, MagicMock


# ─────────────────────────────────────────────────────────────────────────────
# chunker
# ─────────────────────────────────────────────────────────────────────────────

class TestChunker:
    def test_empty_input_returns_empty(self):
        from app.services.chunker import chunk_text
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_short_text_single_chunk(self):
        from app.services.chunker import chunk_text
        text = "Hello world"
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert chunks == [text]

    def test_overlap_creates_extra_chunk(self):
        from app.services.chunker import chunk_text
        text = "A" * 200
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        # step=80; starts at 0, 80, 160 → 3 chunks (last 40 chars)
        assert len(chunks) == 3
        assert chunks[0] == "A" * 100
        assert len(chunks[-1]) <= 100

    def test_no_overlap_contiguous(self):
        from app.services.chunker import chunk_text
        text = "AB" * 150   # 300 chars
        chunks = chunk_text(text, chunk_size=100, overlap=0)
        assert len(chunks) == 3
        assert "".join(chunks) == text

    def test_chunk_size_larger_than_text(self):
        from app.services.chunker import chunk_text
        text = "short"
        chunks = chunk_text(text, chunk_size=1000, overlap=100)
        assert chunks == ["short"]

    def test_default_params_produce_chunks(self):
        from app.services.chunker import chunk_text, CHUNK_SIZE
        text = "X" * (CHUNK_SIZE * 3)
        chunks = chunk_text(text)
        assert len(chunks) >= 3


# ─────────────────────────────────────────────────────────────────────────────
# document_parser
# ─────────────────────────────────────────────────────────────────────────────

class TestDocumentParser:
    def test_unsupported_mime_falls_back_to_decode(self):
        from app.services.document_parser import extract_text
        content = b"plain text content"
        result = extract_text(content, "text/plain", "test.txt")
        assert "plain text content" in result

    def test_bad_pdf_returns_empty_string(self):
        from app.services.document_parser import extract_text
        # Not a real PDF → pdfplumber will raise
        result = extract_text(b"not a pdf", "application/pdf", "bad.pdf")
        assert result == ""

    def test_bad_docx_returns_empty_string(self):
        from app.services.document_parser import extract_text
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        result = extract_text(b"not a docx", mime, "bad.docx")
        assert result == ""


# ─────────────────────────────────────────────────────────────────────────────
# ao_overview
# ─────────────────────────────────────────────────────────────────────────────

class TestAoOverview:
    def test_returns_defaults_on_llm_failure(self):
        from app.services.ao_overview import generate_ao_overview
        with patch("app.services.ao_overview.respond_json", return_value=None):
            result = generate_ao_overview("some text")
        assert result["summary"] == ""
        assert result["in_scope_activities"] == []

    def test_merges_llm_result_with_defaults(self):
        from app.services.ao_overview import generate_ao_overview
        llm_out = {"summary": "Handles credit cards.", "channels": ["phone"]}
        with patch("app.services.ao_overview.respond_json", return_value=llm_out):
            result = generate_ao_overview("some text")
        assert result["summary"] == "Handles credit cards."
        assert result["channels"] == ["phone"]
        assert result["in_scope_activities"] == []   # default filled in

    def test_non_dict_llm_response_returns_defaults(self):
        from app.services.ao_overview import generate_ao_overview
        with patch("app.services.ao_overview.respond_json", return_value="bad"):
            result = generate_ao_overview("text")
        assert isinstance(result, dict)
        assert result["summary"] == ""


# ─────────────────────────────────────────────────────────────────────────────
# ao_profile
# ─────────────────────────────────────────────────────────────────────────────

class TestAoProfile:
    def test_short_text_single_llm_call(self):
        from app.services.ao_profile import extract_ao_profile, LARGE_DOC_THRESHOLD
        text = "X" * (LARGE_DOC_THRESHOLD - 1)
        expected = {"operations_performed": ["handle calls"], "operations_not_performed": []}
        with patch("app.services.ao_profile.respond_json", return_value=expected) as mock_llm:
            result = extract_ao_profile(text)
        # Only one LLM call (no windowing)
        assert mock_llm.call_count == 1
        assert result["operations_performed"] == ["handle calls"]

    def test_long_text_triggers_windowing(self):
        from app.services.ao_profile import extract_ao_profile, LARGE_DOC_THRESHOLD
        text = "Y" * (LARGE_DOC_THRESHOLD + 1)
        with patch("app.services.ao_profile.respond_json", return_value={}) as mock_llm:
            extract_ao_profile(text)
        # Windowing calls + final profile call → at least 2 LLM calls
        assert mock_llm.call_count >= 2

    def test_normalise_drops_extra_keys(self):
        from app.services.ao_profile import extract_ao_profile
        llm_out = {
            "operations_performed": ["A"],
            "bogus_key": ["ignored"],
        }
        with patch("app.services.ao_profile.respond_json", return_value=llm_out):
            result = extract_ao_profile("short text")
        assert "bogus_key" not in result
        assert result["operations_performed"] == ["A"]

    def test_non_dict_llm_returns_empty_profile(self):
        from app.services.ao_profile import extract_ao_profile
        with patch("app.services.ao_profile.respond_json", return_value=None):
            result = extract_ao_profile("text")
        assert all(isinstance(v, list) for v in result.values())


# ─────────────────────────────────────────────────────────────────────────────
# fraud_surface
# ─────────────────────────────────────────────────────────────────────────────

class TestFraudSurface:
    def test_returns_defaults_on_failure(self):
        from app.services.fraud_surface import extract_fraud_surface
        with patch("app.services.fraud_surface.respond_json", return_value=None):
            result = extract_fraud_surface("text")
        assert result == {"exposure_vectors": [], "enablers": [], "authorities": [], "data_assets": []}

    def test_merges_llm_result(self):
        from app.services.fraud_surface import extract_fraud_surface
        llm_out = {"exposure_vectors": ["employee diverts wire"], "enablers": ["unrestricted access"]}
        with patch("app.services.fraud_surface.respond_json", return_value=llm_out):
            result = extract_fraud_surface("text")
        assert result["exposure_vectors"] == ["employee diverts wire"]
        assert result["authorities"] == []   # default


# ─────────────────────────────────────────────────────────────────────────────
# qa_engine – unit tests (no DB)
# ─────────────────────────────────────────────────────────────────────────────

class TestQaEngineUnits:
    def test_load_questions_returns_both_passes(self):
        from app.services.qa_engine import _load_questions
        qs = _load_questions()
        assert len(qs["mandatory"]) > 0
        assert len(qs["situational"]) > 0

    def test_mandatory_questions_have_aup_ids(self):
        from app.services.qa_engine import _load_questions
        qs = _load_questions()
        ids = [q["id"] for q in qs["mandatory"]]
        assert all(qid.startswith("AUP-") for qid in ids)

    def test_situational_questions_have_fre_ids(self):
        from app.services.qa_engine import _load_questions
        qs = _load_questions()
        ids = [q["id"] for q in qs["situational"]]
        assert all(qid.startswith("FRE-") for qid in ids)

    def test_profile_to_text_formats_lists(self):
        from app.services.qa_engine import _profile_to_text
        profile = {"operations_performed": ["handle calls"], "systems": ["CRM"]}
        text = _profile_to_text(profile)
        assert "OPERATIONS PERFORMED" in text
        assert "handle calls" in text
        assert "CRM" in text

    def test_batch_questions_splits_correctly(self):
        from app.services.qa_engine import _batch_questions, _BATCH_SIZE
        qs = [{"id": f"AUP-{i:03d}", "text": "q", "criteria": "c",
               "category": "x", "triggers_if_yes": []} for i in range(50)]
        batches = _batch_questions(qs)
        assert len(batches) == 3   # ceil(50/20)
        assert len(batches[0]) == _BATCH_SIZE

    def test_get_triggered_situational_correct_ids(self):
        from app.services.qa_engine import _get_triggered_situational, _load_questions
        mandatory_resp = [
            {"question_id": "AUP-006", "answer": "yes"},  # triggers FRE-007..013
        ]
        sit_qs = _load_questions()["situational"]
        triggered = _get_triggered_situational(mandatory_resp, sit_qs)
        triggered_ids = {q["id"] for q in triggered}
        assert "FRE-007" in triggered_ids

    def test_get_triggered_empty_when_all_no(self):
        from app.services.qa_engine import _get_triggered_situational, _load_questions
        mandatory_resp = [
            {"question_id": "AUP-006", "answer": "no"},
            {"question_id": "AUP-008", "answer": "no"},
        ]
        sit_qs = _load_questions()["situational"]
        triggered = _get_triggered_situational(mandatory_resp, sit_qs)
        assert triggered == []

    def test_build_exposure_categories_groups_by_category(self):
        from app.services.qa_engine import _build_exposure_categories
        resps = [
            {"question_id": "AUP-001", "answer": "yes", "category": "entity_customer"},
            {"question_id": "AUP-002", "answer": "no",  "category": "entity_customer"},
            {"question_id": "AUP-008", "answer": "yes", "category": "product_service"},
        ]
        cats = _build_exposure_categories(resps)
        assert "entity_customer" in cats
        assert "AUP-001" in cats["entity_customer"]
        assert "AUP-002" not in cats.get("entity_customer", [])
        assert "product_service" in cats

    def test_count_responses_sums_correctly(self):
        from app.services.qa_engine import _count_responses
        resps = [
            {"answer": "yes"},
            {"answer": "yes"},
            {"answer": "no"},
        ]
        counts = _count_responses(resps)
        assert counts == {"yes": 2, "no": 1, "total": 3}

    def test_normalise_response_maps_fields(self):
        from app.services.qa_engine import _normalise_response
        q = {"id": "AUP-001", "text": "Q text", "category": "entity_customer",
             "criteria": "crit", "triggers_if_yes": []}
        resp = {"answer": "yes", "assumed": True, "evidence": "E", "reason": "R"}
        normed = _normalise_response(resp, q)
        assert normed["question_id"] == "AUP-001"
        assert normed["answer"] == "yes"
        assert normed["question_type"] == "mandatory"
        assert normed["user_corrected"] is False
