"""
End-to-end tests for Step 1 preparation routes.

All LLM calls are mocked so no real API key is needed.
The tests hit the real database (TEST_DB_URL in conftest.py).
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_TENANT_ID, TEST_USER_ID

ASSESSMENT_ID = str(uuid.uuid4())

MOCK_OVERVIEW = {
    "summary": "A retail call-centre handling credit card inquiries.",
    "in_scope_activities": ["credit card servicing", "balance inquiries"],
    "out_of_scope_activities": ["new account opening"],
    "channels": ["phone"],
    "systems_or_tools": ["CRM", "IVR"],
    "populations_served": ["retail consumers"],
    "products_handled": ["credit cards"],
    "org_partners": [],
    "regulatory_environment": ["CFPB"],
}

MOCK_PROFILE = {
    "operations_performed": ["handle customer calls", "process card transactions"],
    "operations_not_performed": ["originate new accounts"],
    "systems": ["CRM", "IVR"],
    "channels": ["phone"],
    "employee_capabilities": ["view account balances", "initiate transfers"],
    "populations_served": ["retail customers"],
    "products_handled": ["credit cards"],
    "data_types_processed": ["PII", "account balances"],
    "third_party_involvement": [],
    "regulatory_environment": ["CFPB"],
}

MOCK_FRAUD = {
    "exposure_vectors": ["employee diverts inbound wire"],
    "enablers": ["unrestricted PII access"],
    "authorities": ["initiate transfers without dual approval"],
    "data_assets": ["customer SSNs", "account balances"],
}


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _seed_assessment(db_conn):
    """Create a test assessment and document chunks in the real DB."""
    import asyncio

    async def _setup():
        await db_conn.execute(
            """
            INSERT INTO app.assessments (id, tenant_id, title, status, current_step, created_by)
            VALUES (%s, %s, 'Test CC Assessment', 'draft', 1, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (ASSESSMENT_ID, TEST_TENANT_ID, TEST_USER_ID),
        )
        # Seed a fake document row
        doc_id = str(uuid.uuid4())
        await db_conn.execute(
            """
            INSERT INTO app.assessment_documents
              (id, assessment_id, blob_key, filename, mime_type, blob_size_bytes, uploaded_by, category)
            VALUES (%s, %s, 'fake/key.pdf', 'test.pdf', 'application/pdf', 1000, %s, 'au_description')
            ON CONFLICT DO NOTHING
            """,
            (doc_id, ASSESSMENT_ID, TEST_USER_ID),
        )
        # Seed a chunk row so orchestration.select_ao_chunks returns data
        await db_conn.execute(
            """
            INSERT INTO app.document_chunks
              (assessment_id, document_id, tenant_id, chunk_index, category, content)
            VALUES (%s, %s, %s, 0, 'au_description',
              'The Credit Card Call Centre handles customer inquiries about credit card accounts.')
            """,
            (ASSESSMENT_ID, doc_id, TEST_TENANT_ID),
        )
        await db_conn.commit()

    asyncio.get_event_loop().run_until_complete(_setup())


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _patch_llm():
    """Return a context manager that mocks generate_ao_overview, extract_ao_profile,
    extract_fraud_surface so no real LLM call is made."""
    patches = [
        patch(
            "app.services.orchestration.generate_ao_overview",
            return_value=MOCK_OVERVIEW,
        ),
        patch(
            "app.services.orchestration.extract_ao_profile",
            return_value=MOCK_PROFILE,
        ),
        patch(
            "app.services.orchestration.extract_fraud_surface",
            return_value=MOCK_FRAUD,
        ),
    ]
    return patches


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateOverview:
    def test_post_ao_overview_returns_snapshot(self, test_client: TestClient):
        patches = _patch_llm()
        for p in patches:
            p.start()
        try:
            resp = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview")
        finally:
            for p in patches:
                p.stop()

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ao_summary"] == MOCK_OVERVIEW["summary"]
        assert body["snapshot_version"] == "1.0"
        assert "operational_profile" in body
        assert "fraud_surface" in body

    def test_post_ao_overview_caches_on_second_call(self, test_client: TestClient):
        """Second call without force=True should return cached snapshot."""
        patches = _patch_llm()
        for p in patches:
            p.start()
        try:
            resp1 = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview")
            assert resp1.status_code == 200
        finally:
            for p in patches:
                p.stop()

        # Second call — LLM NOT patched; should still succeed from cache
        resp2 = test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview")
        assert resp2.status_code == 200
        assert resp2.json()["ao_summary"] == MOCK_OVERVIEW["summary"]

    def test_post_ao_overview_force_reruns(self, test_client: TestClient):
        patches = _patch_llm()
        for p in patches:
            p.start()
        try:
            resp = test_client.post(
                f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview",
                json={"force": True},
            )
        finally:
            for p in patches:
                p.stop()
        assert resp.status_code == 200

    def test_post_ao_overview_no_docs_returns_422(self, test_client: TestClient):
        empty_id = str(uuid.uuid4())
        # No documents seeded for this assessment
        with patch(
            "app.services.orchestration.select_ao_chunks",
            new=AsyncMock(return_value=[]),
        ):
            resp = test_client.post(f"/api/v1/assessments/{empty_id}/ao-overview")
        assert resp.status_code == 422


class TestGetSnapshot:
    def test_get_snapshot_after_overview(self, test_client: TestClient):
        patches = _patch_llm()
        for p in patches:
            p.start()
        try:
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview")
        finally:
            for p in patches:
                p.stop()

        resp = test_client.get(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-snapshot")
        assert resp.status_code == 200
        assert "ao_summary" in resp.json()

    def test_get_snapshot_not_found(self, test_client: TestClient):
        resp = test_client.get(f"/api/v1/assessments/{uuid.uuid4()}/ao-snapshot")
        assert resp.status_code == 404


class TestUpdateProfile:
    def test_put_ao_profile_updates_summary(self, test_client: TestClient):
        # First generate a snapshot
        patches = _patch_llm()
        for p in patches:
            p.start()
        try:
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview")
        finally:
            for p in patches:
                p.stop()

        # Now update the profile
        resp = test_client.put(
            f"/api/v1/assessments/{ASSESSMENT_ID}/ao-profile",
            json={"ao_summary": "Manually corrected summary."},
        )
        assert resp.status_code == 200
        assert resp.json()["ao_summary"] == "Manually corrected summary."
        assert resp.json()["user_edited"] is True

    def test_put_ao_profile_not_found(self, test_client: TestClient):
        resp = test_client.put(
            f"/api/v1/assessments/{uuid.uuid4()}/ao-profile",
            json={"ao_summary": "x"},
        )
        assert resp.status_code == 404

    def test_put_ao_profile_operational_profile(self, test_client: TestClient):
        patches = _patch_llm()
        for p in patches:
            p.start()
        try:
            test_client.post(f"/api/v1/assessments/{ASSESSMENT_ID}/ao-overview")
        finally:
            for p in patches:
                p.stop()

        new_profile = {**MOCK_PROFILE, "channels": ["phone", "web"]}
        resp = test_client.put(
            f"/api/v1/assessments/{ASSESSMENT_ID}/ao-profile",
            json={"operational_profile": new_profile},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "web" in body["operational_profile"]["channels"]
