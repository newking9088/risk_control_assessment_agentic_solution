"""Tests for POST /api/v1/upload — file type, magic bytes, size validation."""
import io
import pytest
import uuid


def _make_assessment(test_client) -> str:
    resp = test_client.post("/api/v1/assessments", json={"title": "Doc Upload Test"})
    assert resp.status_code == 201
    return resp.json()["id"]


def test_upload_rejects_disallowed_type(test_client):
    aid = _make_assessment(test_client)
    resp = test_client.post(
        f"/api/v1/upload?assessment_id={aid}",
        files={"file": ("report.txt", b"plain text content", "text/plain")},
    )
    assert resp.status_code in (400, 415)


def test_upload_rejects_mismatched_magic_bytes(test_client):
    aid = _make_assessment(test_client)
    resp = test_client.post(
        f"/api/v1/upload?assessment_id={aid}",
        files={"file": ("report.pdf", b"NOT_A_PDF_FILE_CONTENT", "application/pdf")},
    )
    assert resp.status_code in (400, 415)


def test_upload_rejects_oversized_file(test_client, monkeypatch):
    import app.config.constants as consts
    monkeypatch.setattr(consts, "MAX_FILE_SIZE_BYTES", 10)
    # also patch the import inside the route module
    import app.routes.documents as doc_route
    monkeypatch.setattr(doc_route, "MAX_FILE_SIZE_BYTES", 10)

    aid = _make_assessment(test_client)
    large_content = b"%PDF" + b"x" * 20  # > 10 bytes
    resp = test_client.post(
        f"/api/v1/upload?assessment_id={aid}",
        files={"file": ("big.pdf", large_content, "application/pdf")},
    )
    assert resp.status_code == 413


def test_upload_valid_pdf(test_client):
    aid = _make_assessment(test_client)
    pdf_content = b"%PDF-1.4 fake pdf content padded " + b"x" * 100
    resp = test_client.post(
        f"/api/v1/upload?assessment_id={aid}",
        files={"file": ("valid.pdf", pdf_content, "application/pdf")},
    )
    assert resp.status_code == 200
    assert "document_id" in resp.json()
