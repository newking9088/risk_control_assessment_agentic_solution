import csv
import io
import uuid
from typing import Optional

from fastapi import APIRouter, Request, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from psycopg.rows import dict_row

from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.middleware.permissions import require_minimum_role

router = APIRouter(prefix="/v1/controls", tags=["controls-catalog"])

analyst_gate = Depends(require_minimum_role("analyst"))


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
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    inserted = 0
    skipped = 0

    async with get_tenant_cursor(tenant_id) as cur:
        for row in reader:
            name = (row.get("name") or row.get("Name") or "").strip()
            if not name:
                skipped += 1
                continue

            raw_key = (row.get("is_key_control") or row.get("Key Control") or "").strip().upper()
            is_key = raw_key in ("TRUE", "YES", "Y", "1")

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
                        (row.get("description") or row.get("Description") or "").strip() or None,
                        (row.get("control_type") or row.get("Type") or "").strip() or None,
                        is_key,
                        (row.get("source") or row.get("Source") or "").strip() or None,
                        (row.get("category") or row.get("Category") or "").strip() or None,
                        (row.get("display_label") or row.get("Label") or "").strip() or None,
                        user.get("email"),
                    ),
                )
                inserted += 1
            except Exception:
                skipped += 1

    return {"inserted": inserted, "skipped": skipped}
