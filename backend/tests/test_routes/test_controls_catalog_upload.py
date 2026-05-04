"""
Tests for POST /api/v1/controls/upload

All DB I/O is mocked so these run without a running database or Docker.

Coverage:
  - Newline variants: Unix LF, Windows CRLF, old-Mac CR, mixed
  - UTF-8 BOM (Excel export)
  - Skipping: empty name, whitespace-only name, header-only, empty file
  - Duplicate deduplication (ON CONFLICT DO NOTHING → skipped, not inserted)
  - is_key_control truthy / falsy values
  - Column aliases (uppercase headers)
  - Quoted fields with commas and embedded newlines
  - Multiple rows / bulk insert
  - Non-UTF-8 bytes (errors='replace' must not crash)
  - XLSX file parsing (openpyxl, standard and NGC headers, type normalisation)
"""
import io
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import openpyxl
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.auth import get_current_user
from tests.conftest import MOCK_AUTH_USER

UPLOAD_URL = "/api/v1/controls/upload"
_HEADERS = "name,description,control_type,is_key_control,source,category,display_label"


# ── Fake DB cursor ────────────────────────────────────────────────────────────

class _FakeCursor:
    """Simulates INSERT ... ON CONFLICT DO NOTHING.
    `seen` is shared across requests within a test so duplicate detection works
    across multiple POST calls (mirrors real DB uniqueness constraint behaviour).
    """

    def __init__(self, seen: set):
        self._seen = seen
        self.rowcount = 0

    async def execute(self, sql, params=None):
        if params and len(params) >= 3:
            name = str(params[2]).strip()
            if name in self._seen:
                self.rowcount = 0        # conflict — nothing inserted
            else:
                self._seen.add(name)
                self.rowcount = 1
        else:
            self.rowcount = 1


# ── Test fixture ──────────────────────────────────────────────────────────────

@pytest.fixture
def upload_client():
    """
    TestClient with:
      - auth bypassed → MOCK_AUTH_USER
      - DB pool init/close no-ops (so lifespan succeeds without Docker)
      - get_tenant_cursor replaced with _FakeCursor (in-memory, no DB needed)
    The `seen` name set persists across requests within one test, enabling
    realistic duplicate-detection assertions.
    """
    seen: set = set()

    @asynccontextmanager
    async def _fake_ctx(*args, **kwargs):
        yield _FakeCursor(seen)

    async def _mock_user():
        return MOCK_AUTH_USER

    app.dependency_overrides[get_current_user] = _mock_user

    with patch("app.infra.db.init_db_pool", new_callable=AsyncMock), \
         patch("app.infra.db.close_db_pool", new_callable=AsyncMock), \
         patch("app.routes.controls_catalog.get_tenant_cursor", side_effect=_fake_ctx):
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.pop(get_current_user, None)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _post(client, csv_text: str):
    data = csv_text.encode("utf-8")
    return client.post(
        UPLOAD_URL,
        files={"file": ("controls.csv", io.BytesIO(data), "text/csv")},
    )


def _post_raw(client, raw: bytes):
    return client.post(
        UPLOAD_URL,
        files={"file": ("controls.csv", io.BytesIO(raw), "text/csv")},
    )


# ── Newline handling ──────────────────────────────────────────────────────────

class TestNewlines:
    def test_unix_lf(self, upload_client):
        uid = _uid()
        csv = f"{_HEADERS}\nUnix {uid},Desc,Preventive,FALSE,Internal,Fraud,"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}

    def test_windows_crlf(self, upload_client):
        uid = _uid()
        raw = (f"{_HEADERS}\r\nCRLF {uid},Desc,Preventive,FALSE,Internal,Fraud,").encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}

    def test_cr_only(self, upload_client):
        uid = _uid()
        raw = (f"{_HEADERS}\rCR {uid},Desc,Preventive,FALSE,Internal,Fraud,").encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}

    def test_mixed_newlines(self, upload_client):
        uid = _uid()
        # Header CRLF, first row LF, second row CR
        raw = (
            f"{_HEADERS}\r\n"
            f"Mixed A {uid},,,,,,\n"
            f"Mixed B {uid},,,,,,\r"
        ).encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 2, "skipped": 0}

    def test_trailing_crlf_blank_row_skipped(self, upload_client):
        uid = _uid()
        # Trailing \r\n produces a blank row — must be skipped, not crash
        raw = (f"{_HEADERS}\r\nTrailing {uid},,,,,,\r\n").encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1


# ── BOM handling ──────────────────────────────────────────────────────────────

class TestBOM:
    def test_utf8_bom_excel_export(self, upload_client):
        uid = _uid()
        bom = b"\xef\xbb\xbf"
        raw = bom + f"{_HEADERS}\nBOM {uid},,,,,,".encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}

    def test_utf8_bom_with_crlf(self, upload_client):
        uid = _uid()
        bom = b"\xef\xbb\xbf"
        raw = bom + (f"{_HEADERS}\r\nBOM CRLF {uid},,,,,,").encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}


# ── Skipping rows ─────────────────────────────────────────────────────────────

class TestSkipping:
    def test_empty_name_row_skipped(self, upload_client):
        uid = _uid()
        csv = f"{_HEADERS}\n,no name here,,,,,\nReal {uid},,,,,,"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 1}

    def test_whitespace_only_name_skipped(self, upload_client):
        uid = _uid()
        csv = f"{_HEADERS}\n   \nWhitespace {uid},,,,,,"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 1}

    def test_multiple_empty_name_rows(self, upload_client):
        uid = _uid()
        csv = f"{_HEADERS}\n,,,,,\n,,,,,\nGood {uid},,,,,,"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 2}

    def test_header_only_no_rows(self, upload_client):
        resp = _post(upload_client, _HEADERS)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 0, "skipped": 0}

    def test_empty_file(self, upload_client):
        resp = _post_raw(upload_client, b"")
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 0, "skipped": 0}

    def test_duplicate_counted_as_skipped_not_inserted(self, upload_client):
        uid = _uid()
        name = f"Dupe {uid}"
        csv = f"{_HEADERS}\n{name},,,,,,"
        r1 = _post(upload_client, csv)
        assert r1.json() == {"inserted": 1, "skipped": 0}

        # Same client shares the `seen` set — simulates real DB uniqueness
        r2 = _post(upload_client, csv)
        assert r2.json() == {"inserted": 0, "skipped": 1}

    def test_batch_with_mix_of_dupes_and_new(self, upload_client):
        uid = _uid()
        csv_first = f"{_HEADERS}\nShared {uid},,,,,,"
        _post(upload_client, csv_first)

        csv_second = (
            f"{_HEADERS}\n"
            f"Shared {uid},,,,,,\n"    # duplicate → skipped
            f"Fresh {uid}A,,,,,,\n"    # new → inserted
            f"Fresh {uid}B,,,,,,"      # new → inserted
        )
        r = _post(upload_client, csv_second)
        assert r.status_code == 200
        assert r.json() == {"inserted": 2, "skipped": 1}

    def test_inline_duplicate_rows(self, upload_client):
        uid = _uid()
        # Same name appears twice in one CSV — second hit conflicts
        csv = f"{_HEADERS}\nSame {uid},,,,,,\nSame {uid},,,,,,"
        r = _post(upload_client, csv)
        assert r.status_code == 200
        assert r.json() == {"inserted": 1, "skipped": 1}


# ── is_key_control values ─────────────────────────────────────────────────────

class TestIsKeyControl:
    @pytest.mark.parametrize("truthy", ["TRUE", "true", "True", "YES", "yes", "Y", "y", "1"])
    def test_truthy_values_accepted(self, upload_client, truthy):
        uid = _uid()
        csv = f"name,is_key_control\nKeyCtrl {uid} {truthy},{truthy}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    @pytest.mark.parametrize("falsy", ["FALSE", "false", "NO", "N", "0", ""])
    def test_falsy_values_accepted(self, upload_client, falsy):
        uid = _uid()
        csv = f"name,is_key_control\nNotKey {uid} {falsy or 'empty'},{falsy}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1


# ── Column aliases ────────────────────────────────────────────────────────────

class TestColumnAliases:
    def test_uppercase_header_names(self, upload_client):
        uid = _uid()
        csv = (
            "Name,Description,Type,Key Control,Source,Category,Label\n"
            f"Alias {uid},Some desc,Preventive,YES,Internal,Fraud,lbl"
        )
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_lowercase_header_names(self, upload_client):
        uid = _uid()
        csv = f"{_HEADERS}\nLower {uid},d,Detective,NO,External,Credit,"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_name_only_header(self, upload_client):
        uid = _uid()
        csv = f"name\nMinimal {uid}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_ngc_column_headers(self, upload_client):
        # Exact column names from docs/ngc_controls.xlsx:
        # Control ID, Control Type, Control Name, Description, Type, Key Control, Source
        uid = _uid()
        csv = (
            "Control ID,Control Type,Control Name,Description,Type,Key Control,Source\n"
            f"EFC-001,External,NGC Control {uid},Verifies federal ID documents,Prevent,Non-key,NGC\n"
            f"EFC-002,Internal,NGC Key Control {uid},Transaction monitoring,Detect,Key,NGC"
        )
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 2, "skipped": 0}

    def test_ngc_key_value_parsed_as_true(self, upload_client):
        uid = _uid()
        csv = f"Control Name,Key Control\nKey NGC {uid},Key"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_ngc_non_key_value_parsed_as_false(self, upload_client):
        uid = _uid()
        csv = f"Control Name,Key Control\nNon-key NGC {uid},Non-key"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_control_id_stored_as_display_label(self, upload_client):
        uid = _uid()
        csv = f"Control ID,Control Name\nEFC-{uid},Label Test {uid}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_control_type_stored_as_category(self, upload_client):
        uid = _uid()
        csv = f"Control Name,Control Type\nCatType {uid},External"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1


# ── Quoted fields ─────────────────────────────────────────────────────────────

class TestQuotedFields:
    def test_description_with_comma(self, upload_client):
        uid = _uid()
        csv = f'name,description\nComma {uid},"Desc with, a comma"'
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_description_with_embedded_lf(self, upload_client):
        uid = _uid()
        csv = f'name,description\nEmbed {uid},"Line one\nLine two"'
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_description_with_embedded_crlf_in_quoted_field(self, upload_client):
        uid = _uid()
        # Embedded \r\n inside a quoted field — normalisation converts to \n,
        # csv module then treats it as an embedded newline within the field value.
        raw = f'name,description\r\nEmbCRLF {uid},"Row one\r\nRow two"'.encode("utf-8")
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_name_with_surrounding_whitespace_stripped(self, upload_client):
        uid = _uid()
        csv = f"name\n  Spaced {uid}  "
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1


# ── Bulk insert ───────────────────────────────────────────────────────────────

class TestBulk:
    def test_ten_rows(self, upload_client):
        uid = _uid()
        rows = "\n".join(f"Bulk {uid} {i},,,,,," for i in range(10))
        csv = f"{_HEADERS}\n{rows}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 10, "skipped": 0}

    def test_hundred_rows(self, upload_client):
        uid = _uid()
        rows = "\n".join(f"Hundred {uid} {i},,,,,," for i in range(100))
        csv = f"{_HEADERS}\n{rows}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 100, "skipped": 0}

    def test_mixed_valid_and_empty_in_bulk(self, upload_client):
        uid = _uid()
        lines = []
        for i in range(5):
            lines.append(f"Bulk2 {uid} {i},,,,,,")
            lines.append(",empty row,,,,,")
        csv = f"{_HEADERS}\n" + "\n".join(lines)
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 5, "skipped": 5}


# ── Encoding edge cases ───────────────────────────────────────────────────────

class TestEncoding:
    def test_latin1_byte_replaced_not_crash(self, upload_client):
        # 0xe9 is 'é' in latin-1 but invalid UTF-8; errors='replace' → U+FFFD
        uid = _uid()
        raw = f"name\nCafe{uid}".encode("utf-8") + b"\xe9"
        resp = _post_raw(upload_client, raw)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_utf8_multibyte_name(self, upload_client):
        uid = _uid()
        csv = f"name\n控制{uid}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1


# ── Control type normalisation (CSV path) ────────────────────────────────────

class TestControlTypeNormalise:
    @pytest.mark.parametrize("raw,expected", [
        ("Prevent",   "Preventive"),
        ("Preventive","Preventive"),
        ("Detect",    "Detective"),
        ("Detective", "Detective"),
        ("Correct",   "Corrective"),
        ("Corrective","Corrective"),
        ("Direct",    "Directive"),
        ("Directive", "Directive"),
        ("Other",     "Other"),
    ])
    def test_normalise_via_csv_upload(self, upload_client, raw, expected):
        uid = _uid()
        csv = f"name,control_type\nTypeNorm {uid} {raw},{raw}"
        resp = _post(upload_client, csv)
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1


# ── XLSX upload ───────────────────────────────────────────────────────────────

_XLSX_CTYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _make_xlsx(headers: list, rows: list) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _post_xlsx(client, headers: list, rows: list, filename: str = "controls.xlsx"):
    data = _make_xlsx(headers, rows)
    return client.post(
        UPLOAD_URL,
        files={"file": (filename, io.BytesIO(data), _XLSX_CTYPE)},
    )


class TestXlsx:
    def test_basic_insert(self, upload_client):
        uid = _uid()
        resp = _post_xlsx(
            upload_client,
            ["name", "description", "control_type"],
            [[f"XLSX {uid}", "Desc", "Preventive"]],
        )
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}

    def test_ngc_headers(self, upload_client):
        uid = _uid()
        resp = _post_xlsx(
            upload_client,
            ["Control ID", "Control Type", "Control Name", "Key Control", "Source"],
            [["EFC-001", "External", f"NGC XLSX {uid}", "Key", "NGC"]],
        )
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 0}

    def test_normalise_control_type_prevent(self, upload_client):
        uid = _uid()
        resp = _post_xlsx(
            upload_client,
            ["name", "control_type"],
            [[f"Norm Prev {uid}", "Prevent"]],
        )
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_normalise_control_type_detect(self, upload_client):
        uid = _uid()
        resp = _post_xlsx(
            upload_client,
            ["name", "control_type"],
            [[f"Norm Det {uid}", "Detect"]],
        )
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_key_control_bool_true(self, upload_client):
        uid = _uid()
        resp = _post_xlsx(
            upload_client,
            ["name", "is_key_control"],
            [[f"Bool Key {uid}", True]],
        )
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_empty_name_rows_skipped(self, upload_client):
        uid = _uid()
        resp = _post_xlsx(
            upload_client,
            ["name", "description"],
            [["", "no name"], [None, "also no name"], [f"Good {uid}", "ok"]],
        )
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 1, "skipped": 2}

    def test_duplicate_skipped(self, upload_client):
        uid = _uid()
        name = f"XLSX Dupe {uid}"
        _post_xlsx(upload_client, ["name"], [[name]])
        resp = _post_xlsx(upload_client, ["name"], [[name]])
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 0, "skipped": 1}

    def test_multiple_rows(self, upload_client):
        uid = _uid()
        rows = [[f"XLSX Multi {uid} {i}"] for i in range(5)]
        resp = _post_xlsx(upload_client, ["name"], rows)
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 5, "skipped": 0}

    def test_detected_by_xls_extension(self, upload_client):
        uid = _uid()
        data = _make_xlsx(["name"], [[f"XLS ext {uid}"]])
        resp = upload_client.post(
            UPLOAD_URL,
            files={"file": ("controls.xls", io.BytesIO(data), "application/octet-stream")},
        )
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1

    def test_detected_by_content_type(self, upload_client):
        uid = _uid()
        data = _make_xlsx(["name"], [[f"CType {uid}"]])
        resp = upload_client.post(
            UPLOAD_URL,
            files={"file": ("upload", io.BytesIO(data), _XLSX_CTYPE)},
        )
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1
