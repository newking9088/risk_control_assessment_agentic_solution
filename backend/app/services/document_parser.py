"""
Extract plain text from uploaded document bytes.
Supports PDF (pdfplumber), DOCX/DOC (python-docx), and XLSX/XLS (openpyxl).
"""

import io
import logging

logger = logging.getLogger(__name__)

_MIME_PDF  = "application/pdf"
_MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_MIME_DOC  = "application/msword"
_MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_MIME_XLS  = "application/vnd.ms-excel"


def extract_text(content: bytes, mime_type: str, filename: str = "") -> str:
    """Return extracted plain text; empty string on failure."""
    try:
        if mime_type == _MIME_PDF:
            return _from_pdf(content)
        if mime_type in (_MIME_DOCX, _MIME_DOC):
            return _from_docx(content)
        if mime_type in (_MIME_XLSX, _MIME_XLS):
            return _from_xlsx(content)
        return content.decode("utf-8", errors="replace")
    except Exception as exc:
        logger.warning("Text extraction failed for %r (%s): %s", filename, mime_type, exc)
        return ""


def _from_pdf(content: bytes) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n\n".join(parts)


def _from_docx(content: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _from_xlsx(content: bytes) -> str:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    rows: list[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            line = "\t".join(str(c) for c in row if c is not None)
            if line.strip():
                rows.append(line)
    return "\n".join(rows)
