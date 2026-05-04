"""
Tests for document upload chunk extraction (Step 1 integration).
Verifies that uploading a real text-containing file stores chunks in document_chunks.
"""

import io
import uuid
from unittest.mock import patch, AsyncMock

import pytest

from tests.conftest import TEST_TENANT_ID, TEST_USER_ID

ASSESSMENT_ID = str(uuid.uuid4())


@pytest.fixture(autouse=True)
def _seed_assessment(db_conn):
    import asyncio

    async def _setup():
        await db_conn.execute(
            """
            INSERT INTO app.assessments (id, tenant_id, title, status, current_step, created_by)
            VALUES (%s, %s, 'Doc Test Assessment', 'draft', 1, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (ASSESSMENT_ID, TEST_TENANT_ID, TEST_USER_ID),
        )
        await db_conn.commit()

    asyncio.get_event_loop().run_until_complete(_setup())


class TestDocumentUploadChunks:
    def test_upload_pdf_stores_chunks(self, test_client):
        """Uploading a file with extractable text should store at least one chunk."""
        text_content = b"This is a test AU description for the Contact Center assessment unit. " * 20
        with (
            patch("app.routes.documents._check_magic", return_value=True),
            patch("app.routes.documents._check_chunks_table", new=AsyncMock(return_value=True)),
            patch(
                "app.routes.documents.extract_text",
                return_value="Test AU description content " * 30,
            ),
        ):
            resp = test_client.post(
                f"/api/v1/upload?assessment_id={ASSESSMENT_ID}&category=au_description",
                files={"file": ("test.pdf", io.BytesIO(text_content), "application/pdf")},
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "document_id" in body
        assert body["chunks_stored"] >= 1

    def test_upload_empty_text_stores_zero_chunks(self, test_client):
        """If text extraction yields nothing, no chunks are stored."""
        with (
            patch("app.routes.documents._check_magic", return_value=True),
            patch("app.routes.documents._check_chunks_table", new=AsyncMock(return_value=True)),
            patch("app.routes.documents.extract_text", return_value=""),
        ):
            resp = test_client.post(
                f"/api/v1/upload?assessment_id={ASSESSMENT_ID}&category=au_description",
                files={"file": ("blank.pdf", io.BytesIO(b"%PDF-empty"), "application/pdf")},
            )

        assert resp.status_code == 200
        assert resp.json()["chunks_stored"] == 0

    def test_upload_bad_mime_rejected(self, test_client):
        resp = test_client.post(
            f"/api/v1/upload?assessment_id={ASSESSMENT_ID}",
            files={"file": ("evil.exe", io.BytesIO(b"MZ"), "application/x-msdownload")},
        )
        assert resp.status_code == 400

    def test_upload_returns_chunks_stored_key(self, test_client):
        """Even when chunk table doesn't exist, response always has chunks_stored key."""
        with (
            patch("app.routes.documents._check_magic", return_value=True),
            patch("app.routes.documents._check_chunks_table", new=AsyncMock(return_value=False)),
        ):
            resp = test_client.post(
                f"/api/v1/upload?assessment_id={ASSESSMENT_ID}",
                files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
            )
        assert resp.status_code == 200
        assert "chunks_stored" in resp.json()
        assert resp.json()["chunks_stored"] == 0
