import csv
import io
import uuid
from typing import Optional

import openpyxl
from fastapi import APIRouter, Request, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.middleware.permissions import require_minimum_role

router = APIRouter(prefix="/v1/controls", tags=["controls-catalog"])

analyst_gate = Depends(require_minimum_role("analyst"))

_CTRL_TYPE_MAP = {
    "prevent": "Preventive",
    "detect":  "Detective",
    "correct": "Corrective",
    "direct":  "Directive",
}


def _normalise_control_type(raw: str) -> str:
    lower = raw.strip().lower()
    for prefix, full in _CTRL_TYPE_MAP.items():
        if lower.startswith(prefix):
            return full
    return raw.strip()


def _str(v) -> str:
    return "" if v is None else str(v).strip()


def _extract_fields(row: dict) -> tuple:
    name = (
        _str(row.get("name")) or _str(row.get("Name")) or
        _str(row.get("control_name")) or _str(row.get("Control Name"))
    )
    raw_key = (
        _str(row.get("is_key_control")) or _str(row.get("Key Control"))
    ).upper()
    is_key = raw_key in ("TRUE", "YES", "Y", "1", "KEY")

    raw_type = _str(row.get("control_type")) or _str(row.get("Type"))
    control_type = _normalise_control_type(raw_type) if raw_type else None

    description = _str(row.get("description")) or _str(row.get("Description")) or None
    source = _str(row.get("source")) or _str(row.get("Source")) or None
    category = (
        _str(row.get("category")) or _str(row.get("Category")) or
        _str(row.get("Control Type"))
    ) or None
    display_label = (
        _str(row.get("display_label")) or _str(row.get("Label")) or
        _str(row.get("control_id")) or _str(row.get("Control ID"))
    ) or None

    return name, is_key, description, control_type, source, category, display_label


def _iter_xlsx_rows(content: bytes):
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    headers = [_str(h) for h in next(rows, [])]
    for row_vals in rows:
        yield {headers[i]: _str(v) for i, v in enumerate(row_vals) if i < len(headers)}
    wb.close()


def _iter_csv_rows(content: bytes):
    text = content.decode("utf-8-sig", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    yield from csv.DictReader(io.StringIO(text))


class ControlCreate(BaseModel):
    name: str
    description: Optional[str] = None
    control_type: Optional[str] = None
    is_key_control: bool = False
    source: Optional[str] = None
    category: Optional[str] = None
    tags: list[str] = []
    display_label: Optional[str] = None


@router.get("")
async def list_controls(
    request: Request,
    type: Optional[str] = None,
    source: Optional[str] = None,
    key_only: bool = False,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    conditions = ["tenant_id = %s"]
    params: list = [tenant_id]

    if type:
        conditions.append("control_type = %s")
        params.append(type)
    if source:
        conditions.append("source = %s")
        params.append(source)
    if key_only:
        conditions.append("is_key_control = TRUE")
    if q:
        conditions.append("(name ILIKE %s OR description ILIKE %s)")
        params.extend([f"%{q}%", f"%{q}%"])

    where = " AND ".join(conditions)
    offset = (page - 1) * page_size

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT COUNT(*) AS total FROM app.control_catalog WHERE {where}",
            params,
        )
        total = (await cur.fetchone())["total"]

        await cur.execute(
            f"""SELECT id, name, description, control_type, is_key_control,
                       source, category, tags, display_label, created_at
                FROM app.control_catalog
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s""",
            params + [page_size, offset],
        )
        items = await cur.fetchall()

    return {"items": items, "total": total}


@router.get("/sources")
async def list_control_sources(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT DISTINCT source FROM app.control_catalog
               WHERE tenant_id = %s AND source IS NOT NULL AND source <> ''
               ORDER BY source""",
            (tenant_id,),
        )
        rows = await cur.fetchall()
    return [r["source"] for r in rows]


@router.post("", status_code=201, dependencies=[analyst_gate])
async def create_control(body: ControlCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    control_id = str(uuid.uuid4())

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            """INSERT INTO app.control_catalog
               (id, tenant_id, name, description, control_type, is_key_control,
                source, category, tags, display_label, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                control_id, tenant_id, body.name, body.description,
                body.control_type, body.is_key_control, body.source,
                body.category, body.tags, body.display_label,
                user.get("email"),
            ),
        )
    return {"id": control_id}


@router.get("/report")
async def export_controls_csv(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT name, description, control_type, is_key_control,
                      source, category, display_label, created_at
               FROM app.control_catalog
               WHERE tenant_id = %s
               ORDER BY created_at""",
            (tenant_id,),
        )
        rows = await cur.fetchall()

    def generate():
        buf = io.StringIO()
        writer = csv.DictWriter(
            buf,
            fieldnames=["name", "description", "control_type", "is_key_control",
                        "source", "category", "display_label", "created_at"],
        )
        writer.writeheader()
        yield buf.getvalue()
        for row in rows:
            buf = io.StringIO()
            writer = csv.DictWriter(
                buf,
                fieldnames=["name", "description", "control_type", "is_key_control",
                            "source", "category", "display_label", "created_at"],
            )
            writer.writerow(dict(row))
            yield buf.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=controls_export.csv"},
    )


@router.get("/{control_id}")
async def get_control(control_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            """SELECT id, name, description, control_type, is_key_control,
                      source, category, tags, display_label, created_at
               FROM app.control_catalog
               WHERE id = %s AND tenant_id = %s""",
            (control_id, tenant_id),
        )
        row = await cur.fetchone()

    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Control not found")
    return row


@router.delete("/{control_id}", status_code=204, dependencies=[analyst_gate])
async def delete_control(control_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "DELETE FROM app.control_catalog WHERE id = %s AND tenant_id = %s",
            (control_id, tenant_id),
        )


@router.post("/upload", dependencies=[analyst_gate])
async def upload_controls_csv(request: Request, file: UploadFile = File(...)):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    content = await file.read()

    fname = (file.filename or "").lower()
    ctype = (file.content_type or "").lower()
    is_xlsx = fname.endswith((".xlsx", ".xls")) or "spreadsheet" in ctype or "ms-excel" in ctype

    row_iter = _iter_xlsx_rows(content) if is_xlsx else _iter_csv_rows(content)

    inserted = 0
    skipped = 0

    async with get_tenant_cursor(tenant_id) as cur:
        for row in row_iter:
            name, is_key, description, control_type, source, category, display_label = _extract_fields(row)
            if not name:
                skipped += 1
                continue

            try:
                await cur.execute(
                    """INSERT INTO app.control_catalog
                       (id, tenant_id, name, description, control_type, is_key_control,
                        source, category, display_label, created_by)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (tenant_id, name) DO NOTHING""",
                    (
                        str(uuid.uuid4()),
                        tenant_id,
                        name,
                        description,
                        control_type,
                        is_key,
                        source,
                        category,
                        display_label,
                        user.get("email"),
                    ),
                )
                # rowcount=0 means ON CONFLICT DO NOTHING fired (duplicate)
                if cur.rowcount:
                    inserted += 1
                else:
                    skipped += 1
            except Exception:
                skipped += 1

    return {"inserted": inserted, "skipped": skipped}
