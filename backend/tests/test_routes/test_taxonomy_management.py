"""
Tests for taxonomy_management.py

All DB I/O is mocked so these run without Docker.

Coverage:
  - _parse_csv: CRLF, CR-only, BOM newline / encoding normalisation
  - _parse_csv: risk vs control column detection
  - GET /{taxonomy_id}: coerces {} / None risks_data & controls_data to []
  - GET /{taxonomy_id}: leaves list values unchanged
  - _normalise_risks: flat format (name/Name/Risk Name headers)
  - _normalise_risks: NGC hierarchical format (L1 Risk through L4 Risk headers)
"""
import io
import uuid
from contextlib import asynccontextmanager
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

import app.routes.taxonomy_management as tax_mod
from app.main import app
from app.middleware.auth import get_current_user
from app.routes.taxonomy_management import _parse_csv, _normalise_risks
from tests.conftest import MOCK_AUTH_USER, TEST_TENANT_ID


# ── Helpers ───────────────────────────────────────────────────────────────────

def _uid() -> str:
    return uuid.uuid4().hex[:8]


class _FakeCursor:
    """Minimal cursor that returns a preset row from fetchone()."""

    def __init__(self, row=None):
        self._row = row

    async def execute(self, sql, params=None):
        pass

    async def fetchone(self):
        return self._row

    async def fetchall(self):
        return [self._row] if self._row else []


@contextmanager
def _taxonomy_client(mock_row):
    """
    Yield a TestClient with:
      - auth bypassed
      - DB pool init/close no-ops
      - get_tenant_cursor returning mock_row
      - _NEW_COLS_EXIST forced to True (skips column-check query)
    """
    @asynccontextmanager
    async def _fake_ctx(*args, **kwargs):
        yield _FakeCursor(mock_row)

    async def _mock_user():
        return MOCK_AUTH_USER

    app.dependency_overrides[get_current_user] = _mock_user

    with patch.object(tax_mod, "_NEW_COLS_EXIST", True), \
         patch("app.infra.db.init_db_pool", new_callable=AsyncMock), \
         patch("app.infra.db.close_db_pool", new_callable=AsyncMock), \
         patch("app.routes.taxonomy_management.get_tenant_cursor", side_effect=_fake_ctx):
        with TestClient(app) as client:
            yield client

    app.dependency_overrides.pop(get_current_user, None)


def _sample_row(risks_data=None, controls_data=None):
    return {
        "id": "tax-001",
        "name": "Test Taxonomy",
        "version": 1,
        "source_type": "both",
        "schema": {},
        "risks_data": risks_data if risks_data is not None else [],
        "controls_data": controls_data if controls_data is not None else [],
        "risk_count": 0,
        "control_count": 0,
        "active": True,
        "file_name": None,
        "uploaded_at": None,
        "created_at": "2026-01-01T00:00:00",
        "tenant_id": TEST_TENANT_ID,
    }


# ── _parse_csv unit tests ─────────────────────────────────────────────────────

class TestParseCsvNewlines:
    # _parse_csv detects risk path when any header contains "risk".
    # Using "risk_id,name,category" ensures the risk normalisation path is taken.

    def test_unix_lf_risk(self):
        uid = _uid()
        csv_bytes = f"risk_id,name,category\nR-001,Risk {uid},Fraud".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 1
        assert risks[0]["name"] == f"Risk {uid}"

    def test_crlf_risk(self):
        uid = _uid()
        csv_bytes = f"risk_id,name,category\r\nR-001,Risk {uid},Fraud\r\nR-002,Risk2 {uid},Credit".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 2

    def test_cr_only_no_crash(self):
        """Bare \\r (old Mac) causes _csv.Error without newline normalisation."""
        uid = _uid()
        csv_bytes = f"risk_id,name,category\rR-001,Risk {uid},Fraud\rR-002,Risk2 {uid},Credit".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 2

    def test_mixed_newlines(self):
        uid = _uid()
        csv_bytes = (
            f"risk_id,name,category\r\n"
            f"R-001,Risk {uid},Fraud\n"
            f"R-002,Risk2 {uid},Credit\r"
        ).encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 2

    def test_trailing_crlf_blank_row_skipped(self):
        uid = _uid()
        csv_bytes = f"risk_id,name,category\r\nR-001,Risk {uid},Fraud\r\n".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 1


class TestParseCsvBom:
    def test_utf8_bom_stripped(self):
        """UTF-8 BOM (0xEF BB BF) must be stripped so first header is 'risk_id' not '\\ufeffrisk_id'."""
        uid = _uid()
        bom = b"\xef\xbb\xbf"
        csv_bytes = bom + f"risk_id,name,category\nR-001,BOM Risk {uid},Fraud".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 1
        assert risks[0]["name"] == f"BOM Risk {uid}"

    def test_utf8_bom_with_crlf(self):
        uid = _uid()
        bom = b"\xef\xbb\xbf"
        csv_bytes = bom + f"risk_id,name,category\r\nR-001,BOM CRLF {uid},Credit".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 1


class TestParseCsvColumnDetection:
    def test_risk_headers_produce_risks(self):
        uid = _uid()
        # "risk_id" contains "risk" → risk path
        csv_bytes = f"risk_id,name,category\nR-001,Risk {uid},Fraud".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 1
        assert len(controls) == 0

    def test_control_headers_produce_controls(self):
        uid = _uid()
        # no header contains "risk" → control path
        csv_bytes = f"control_name,control_type\nCtrl {uid},Preventive".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 0
        assert len(controls) == 1

    def test_empty_csv_returns_empty(self):
        risks, controls = _parse_csv(b"")
        assert risks == []
        assert controls == []

    def test_risk_name_header_detected_as_risk(self):
        uid = _uid()
        # "Risk Name" header → lowercase "risk name" contains "risk"
        csv_bytes = f"Risk Name,category\nFraud Risk {uid},Fraud".encode("utf-8")
        risks, controls = _parse_csv(csv_bytes)
        assert len(risks) == 1


# ── GET /{taxonomy_id} — JSONB coercion ──────────────────────────────────────

class TestFetchTaxonomyCoercion:
    def test_risks_data_dict_coerced_to_list(self):
        """DB stores {} when no rows were parsed — must become [] in response."""
        row = _sample_row(risks_data={}, controls_data=[])
        with _taxonomy_client(row) as client:
            resp = client.get("/api/v1/taxonomy/tax-001")
        assert resp.status_code == 200
        assert resp.json()["risks_data"] == []

    def test_controls_data_dict_coerced_to_list(self):
        row = _sample_row(risks_data=[], controls_data={})
        with _taxonomy_client(row) as client:
            resp = client.get("/api/v1/taxonomy/tax-001")
        assert resp.status_code == 200
        assert resp.json()["controls_data"] == []

    def test_both_data_dicts_coerced(self):
        row = _sample_row(risks_data={}, controls_data={})
        with _taxonomy_client(row) as client:
            resp = client.get("/api/v1/taxonomy/tax-001")
        data = resp.json()
        assert data["risks_data"] == []
        assert data["controls_data"] == []

    def test_risks_data_none_coerced_to_list(self):
        row = _sample_row(risks_data=None, controls_data=None)
        row["risks_data"] = None
        row["controls_data"] = None
        with _taxonomy_client(row) as client:
            resp = client.get("/api/v1/taxonomy/tax-001")
        data = resp.json()
        assert data["risks_data"] == []
        assert data["controls_data"] == []

    def test_risks_data_list_unchanged(self):
        risks = [{"risk_id": "R-001", "name": "Fraud Risk", "category": "Fraud",
                  "description": "", "source": "EXT"}]
        row = _sample_row(risks_data=risks, controls_data=[])
        with _taxonomy_client(row) as client:
            resp = client.get("/api/v1/taxonomy/tax-001")
        assert resp.json()["risks_data"] == risks

    def test_controls_data_list_unchanged(self):
        controls = [{"control_id": "C-001", "control_name": "MFA",
                     "description": "", "control_type": "Preventive", "is_key": True}]
        row = _sample_row(risks_data=[], controls_data=controls)
        with _taxonomy_client(row) as client:
            resp = client.get("/api/v1/taxonomy/tax-001")
        assert resp.json()["controls_data"] == controls


# ── _normalise_risks — flat format ────────────────────────────────────────────

class TestNormaliseRisksFlat:
    def test_name_header(self):
        risks = _normalise_risks([{"name": "Fraud Risk", "category": "Fraud", "source": "EXT"}])
        assert len(risks) == 1
        assert risks[0]["name"] == "Fraud Risk"
        assert risks[0]["category"] == "Fraud"

    def test_Name_header(self):
        risks = _normalise_risks([{"Name": "Payment Risk"}])
        assert len(risks) == 1
        assert risks[0]["name"] == "Payment Risk"

    def test_Risk_Name_header(self):
        risks = _normalise_risks([{"Risk Name": "Compliance Risk", "Category": "Compliance"}])
        assert len(risks) == 1
        assert risks[0]["name"] == "Compliance Risk"

    def test_blank_name_skipped(self):
        risks = _normalise_risks([{"name": ""}, {"name": "   "}, {"name": "Good Risk"}])
        assert len(risks) == 1
        assert risks[0]["name"] == "Good Risk"

    def test_auto_generated_risk_id(self):
        risks = _normalise_risks([{"name": "Risk A"}])
        assert risks[0]["risk_id"].startswith("R-")


# ── _normalise_risks — NGC hierarchical format ────────────────────────────────

def _hier_row(**kwargs) -> dict:
    """Return a minimal hierarchical row dict with all L-columns present."""
    base = {
        "L1 Risk": "", "L2 Risk": "", "L3 Risk": "",
        "L3 Risk Description": "", "L4 Risk": "",
        "L4 Risk Description": "", "Source": "NGC",
    }
    base.update(kwargs)
    return base


class TestNormaliseRisksHierarchical:
    def test_basic_l1_l4_parsing(self):
        """L1 → category, L4 → name, L3 code → risk_id."""
        rows = [_hier_row(
            **{"L1 Risk": "Fraud",
               "L3 Risk": "A001E - Altered Payment",
               "L3 Risk Description": "Altered cheque",
               "L4 Risk": "A001E.01 - Cheque Alteration",
               "L4 Risk Description": "Physical alteration"}
        )]
        risks = _normalise_risks(rows)
        assert len(risks) == 1
        assert risks[0]["category"] == "Fraud"
        assert risks[0]["name"] == "A001E.01 - Cheque Alteration"
        assert risks[0]["risk_id"] == "A001E"
        assert risks[0]["description"] == "Physical alteration"

    def test_l1_l3_carry_forward_across_rows(self):
        """L1/L3 filled only on first row; subsequent rows inherit them."""
        rows = [
            _hier_row(**{"L1 Risk": "Fraud", "L3 Risk": "A001E - Altered Payment",
                         "L4 Risk": "A001E.01 - Row One"}),
            _hier_row(**{"L4 Risk": "A001E.02 - Row Two"}),   # L1/L3 empty → carry forward
        ]
        risks = _normalise_risks(rows)
        assert len(risks) == 2
        assert risks[1]["category"] == "Fraud"
        assert risks[1]["risk_id"] == "A001E"
        assert risks[1]["name"] == "A001E.02 - Row Two"

    def test_new_l3_updates_risk_id(self):
        """When a new L3 value appears in a row, risk_id is re-extracted."""
        rows = [
            _hier_row(**{"L1 Risk": "Fraud", "L3 Risk": "A001E - Altered Payment",
                         "L4 Risk": "A001E.01 - First"}),
            _hier_row(**{"L3 Risk": "B002F - Transfer Fraud",
                         "L4 Risk": "B002F.01 - Wire Transfer"}),
        ]
        risks = _normalise_risks(rows)
        assert risks[0]["risk_id"] == "A001E"
        assert risks[1]["risk_id"] == "B002F"

    def test_fallback_to_l3_when_l4_empty(self):
        """If L4 Risk is empty, L3 Risk is used as the risk name."""
        rows = [_hier_row(**{"L1 Risk": "Fraud",
                             "L3 Risk": "A001E - Altered Payment",
                             "L3 Risk Description": "Altered cheques"})]
        risks = _normalise_risks(rows)
        assert len(risks) == 1
        assert risks[0]["name"] == "A001E - Altered Payment"
        assert risks[0]["description"] == "Altered cheques"

    def test_empty_rows_skipped(self):
        """Rows with no L3 or L4 Risk value produce no output."""
        rows = [
            _hier_row(**{"L1 Risk": "Fraud"}),   # no L3/L4 → skip
            _hier_row(**{"L3 Risk": "A001E - Payment", "L4 Risk": "A001E.01 - Sub"}),
        ]
        risks = _normalise_risks(rows)
        assert len(risks) == 1
        assert risks[0]["name"] == "A001E.01 - Sub"
