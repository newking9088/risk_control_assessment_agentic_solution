import io
import csv
import uuid
from typing import List, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from psycopg.rows import dict_row
from pydantic import BaseModel

from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError
from app.infra.db import get_tenant_cursor

router = APIRouter(prefix="/v1/admin", tags=["admin"])


# ── Pydantic models ────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "viewer"
    status: str = "active"
    password: str


class UserPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class RolePatch(BaseModel):
    display_label: Optional[str] = None
    hierarchy_level: Optional[int] = None
    capabilities: Optional[List[str]] = None


class ApprovalCreate(BaseModel):
    assessment_id: str
    type: str
    scope: Optional[str] = None
    reason: Optional[str] = None


class ApprovalPatch(BaseModel):
    status: str
    review_note: Optional[str] = None


class TaxonomyCreate(BaseModel):
    name: str
    schema_data: dict


# ── Default capability matrix ──────────────────────────────────────

DEFAULT_CAPABILITIES: dict[str, list[str]] = {
    "viewer":         ["view_assessments"],
    "analyst":        ["view_assessments", "create_edit"],
    "senior_analyst": ["view_assessments", "create_edit"],
    "team_lead":      ["view_assessments", "create_edit", "upload_taxonomies"],
    "delivery_lead":  [
        "view_assessments", "create_edit", "delete_assessments",
        "manage_taxonomies", "upload_taxonomies", "configure_llm",
        "clear_cache", "view_audit_logs", "manage_users",
    ],
    "admin": [
        "view_assessments", "create_edit", "delete_assessments",
        "manage_taxonomies", "upload_taxonomies", "configure_llm",
        "clear_cache", "view_audit_logs", "manage_users",
    ],
}


# ── USERS ─────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    request: Request,
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    offset = (page - 1) * limit

    conditions = ["tenant_id = %s", "deleted_at IS NULL"]
    params: list = [tenant_id]

    if search:
        conditions.append("(name ILIKE %s OR email ILIKE %s)")
        params += [f"%{search}%", f"%{search}%"]
    if role:
        conditions.append("role = %s")
        params.append(role)
    if status:
        conditions.append("status = %s")
        params.append(status)

    where = " AND ".join(conditions)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT COUNT(*) AS total FROM app.users WHERE {where}",
            params,
        )
        total = (await cur.fetchone())["total"]

        await cur.execute(
            f"SELECT id, name, email, role, status, created_at "
            f"FROM app.users WHERE {where} ORDER BY created_at DESC "
            f"LIMIT %s OFFSET %s",
            params + [limit, offset],
        )
        rows = await cur.fetchall()

    return {"total": total, "users": rows}


@router.post("/users", status_code=201)
async def create_user(body: UserCreate, request: Request):
    import hashlib
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    user_id = str(uuid.uuid4())
    pw_hash = hashlib.sha256(body.password.encode()).hexdigest()

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.users (id, tenant_id, email, name, role, status, password_hash) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (user_id, tenant_id, body.email, body.name, body.role, body.status, pw_hash),
        )
    return {"id": user_id}


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"id": user_id}

    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [tenant_id, user_id]

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            f"UPDATE app.users SET {set_clauses}, updated_at = NOW() "
            f"WHERE tenant_id = %s AND id = %s AND deleted_at IS NULL",
            values,
        )
        if cur.rowcount == 0:
            raise NotFoundError("user")
    return {"id": user_id}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.users SET status = 'inactive', deleted_at = NOW(), updated_at = NOW() "
            "WHERE tenant_id = %s AND id = %s AND deleted_at IS NULL",
            (tenant_id, user_id),
        )
        if cur.rowcount == 0:
            raise NotFoundError("user")


# ── ROLES & PERMISSIONS ───────────────────────────────────────────

@router.get("/roles")
async def list_roles(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT role, display_label, hierarchy_level, capabilities "
            "FROM app.role_configs WHERE tenant_id = %s ORDER BY hierarchy_level",
            (tenant_id,),
        )
        return await cur.fetchall()


@router.put("/roles/{role}")
async def update_role(role: str, body: RolePatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"role": role}

    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [tenant_id, role]

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            f"UPDATE app.role_configs SET {set_clauses}, updated_at = NOW() "
            f"WHERE tenant_id = %s AND role = %s",
            values,
        )
    return {"role": role}


@router.post("/roles/reset")
async def reset_roles(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        for role_name, caps in DEFAULT_CAPABILITIES.items():
            await cur.execute(
                "UPDATE app.role_configs SET capabilities = %s, updated_at = NOW() "
                "WHERE tenant_id = %s AND role = %s",
                (caps, tenant_id, role_name),
            )
    return {"reset": True}


# ── AUDIT LOGS ────────────────────────────────────────────────────

@router.get("/audit-logs/insights")
async def audit_insights(
    request: Request,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    date_extra = ""
    date_params: list = []
    if from_date:
        date_extra += " AND created_at >= %s"
        date_params.append(from_date)
    if to_date:
        date_extra += " AND created_at <= %s"
        date_params.append(to_date)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT "
            f"  COUNT(*) FILTER (WHERE event_type = 'login_failed')    AS failed_logins, "
            f"  COUNT(*) FILTER (WHERE event_type = 'risk_override')   AS risk_overrides, "
            f"  COUNT(*) FILTER (WHERE event_type = 'risk_downgrade')  AS downgrades, "
            f"  COALESCE(SUM((detail->>'cost_usd')::numeric) "
            f"    FILTER (WHERE event_type = 'llm_call'), 0)           AS llm_cost_usd, "
            f"  COUNT(DISTINCT actor_id)                               AS active_users, "
            f"  COUNT(*) FILTER (WHERE event_type = 'assessment_saved') AS assessments_saved "
            f"FROM app.audit_logs WHERE tenant_id = %s{date_extra}",
            [tenant_id] + date_params,
        )
        metrics = await cur.fetchone()

        await cur.execute(
            f"SELECT actor_id, actor_name, "
            f"  COUNT(*) AS overrides, "
            f"  COUNT(*) FILTER (WHERE event_type = 'risk_downgrade') AS downgrades "
            f"FROM app.audit_logs "
            f"WHERE tenant_id = %s AND event_type IN ('risk_override','risk_downgrade'){date_extra} "
            f"GROUP BY actor_id, actor_name ORDER BY overrides DESC LIMIT 10",
            [tenant_id] + date_params,
        )
        top_raw = await cur.fetchall()

    risk_overrides = int(metrics["risk_overrides"] or 0)
    downgrades = int(metrics["downgrades"] or 0)
    downgrade_pct = round((downgrades / risk_overrides * 100) if risk_overrides > 0 else 0, 1)

    top_overriders = []
    for row in top_raw:
        pct = round((row["downgrades"] / row["overrides"] * 100) if row["overrides"] > 0 else 0, 1)
        top_overriders.append({
            "user_id": str(row["actor_id"]) if row["actor_id"] else None,
            "name": row["actor_name"],
            "overrides": row["overrides"],
            "downgrades": row["downgrades"],
            "pct": pct,
        })

    return {
        "failed_logins": int(metrics["failed_logins"] or 0),
        "risk_overrides": risk_overrides,
        "downgrades": downgrades,
        "downgrade_pct": downgrade_pct,
        "llm_cost_usd": float(metrics["llm_cost_usd"] or 0),
        "active_users": int(metrics["active_users"] or 0),
        "assessments_saved": int(metrics["assessments_saved"] or 0),
        "top_overriders": top_overriders,
    }


@router.get("/audit-logs/export")
async def export_audit_logs(
    request: Request,
    event_type: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    conditions = ["tenant_id = %s"]
    params: list = [tenant_id]
    if event_type:
        conditions.append("event_type = %s"); params.append(event_type)
    if entity_type:
        conditions.append("entity_type = %s"); params.append(entity_type)
    if actor:
        conditions.append("actor_name ILIKE %s"); params.append(f"%{actor}%")
    if from_date:
        conditions.append("created_at >= %s"); params.append(from_date)
    if to_date:
        conditions.append("created_at <= %s"); params.append(to_date)

    where = " AND ".join(conditions)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT id, event_type, actor_name, entity_type, entity_id, detail, created_at "
            f"FROM app.audit_logs WHERE {where} ORDER BY created_at DESC",
            params,
        )
        rows = await cur.fetchall()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "event_type", "actor_name", "entity_type", "entity_id", "detail", "created_at"],
    )
    writer.writeheader()
    for row in rows:
        row["detail"] = str(row.get("detail", {}))
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )


@router.get("/audit-logs")
async def list_audit_logs(
    request: Request,
    event_type: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    offset = (page - 1) * limit

    conditions = ["tenant_id = %s"]
    params: list = [tenant_id]
    if event_type:
        conditions.append("event_type = %s"); params.append(event_type)
    if entity_type:
        conditions.append("entity_type = %s"); params.append(entity_type)
    if actor:
        conditions.append("actor_name ILIKE %s"); params.append(f"%{actor}%")
    if from_date:
        conditions.append("created_at >= %s"); params.append(from_date)
    if to_date:
        conditions.append("created_at <= %s"); params.append(to_date)

    where = " AND ".join(conditions)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT COUNT(*) AS total FROM app.audit_logs WHERE {where}",
            params,
        )
        total = (await cur.fetchone())["total"]

        await cur.execute(
            f"SELECT id, event_type, actor_id, actor_name, entity_type, entity_id, detail, created_at "
            f"FROM app.audit_logs WHERE {where} ORDER BY created_at DESC "
            f"LIMIT %s OFFSET %s",
            params + [limit, offset],
        )
        events = await cur.fetchall()

    return {"total": int(total), "events": events}


# ── APPROVALS ─────────────────────────────────────────────────────

@router.get("/approvals")
async def list_approvals(
    request: Request,
    status: Optional[str] = Query(None),
):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    conditions = ["a.tenant_id = %s"]
    params: list = [tenant_id]
    if status and status != "all":
        conditions.append("a.status = %s")
        params.append(status)

    where = " AND ".join(conditions)

    async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
        await cur.execute(
            f"SELECT a.id, a.assessment_id, ass.title AS assessment_title, "
            f"  a.type, a.scope, a.requested_by, a.reason, a.status, "
            f"  a.review_note, a.reviewed_by, a.submitted_at, a.reviewed_at "
            f"FROM app.approvals a "
            f"LEFT JOIN app.assessments ass ON ass.id = a.assessment_id "
            f"WHERE {where} ORDER BY a.submitted_at DESC",
            params,
        )
        return await cur.fetchall()


@router.post("/approvals", status_code=201)
async def create_approval(body: ApprovalCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    approval_id = str(uuid.uuid4())

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.approvals "
            "(id, tenant_id, assessment_id, type, scope, requested_by, reason) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (approval_id, tenant_id, body.assessment_id, body.type,
             body.scope, user.get("id"), body.reason),
        )
    return {"id": approval_id}


@router.patch("/approvals/{approval_id}")
async def update_approval(approval_id: str, body: ApprovalPatch, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)

    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.approvals "
            "SET status = %s, review_note = %s, reviewed_by = %s, reviewed_at = NOW() "
            "WHERE id = %s AND tenant_id = %s",
            (body.status, body.review_note, user.get("id"), approval_id, tenant_id),
        )
        if cur.rowcount == 0:
            raise NotFoundError("approval")
    return {"id": approval_id}


# ── LEGACY taxonomy endpoints ──────────────────────────────────────

@router.post("/taxonomy")
async def create_taxonomy(body: TaxonomyCreate, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    taxonomy_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.taxonomy_schemas (id, tenant_id, name, schema) VALUES (%s, %s, %s, %s)",
            (taxonomy_id, tenant_id, body.name, body.schema_data),
        )
    return {"taxonomy_id": taxonomy_id}


@router.get("/taxonomy")
async def list_taxonomy(request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "SELECT id, name, version, active FROM app.taxonomy_schemas "
            "WHERE tenant_id = %s ORDER BY created_at DESC",
            (tenant_id,),
        )
        rows = await cur.fetchall()
    return [{"id": r[0], "name": r[1], "version": r[2], "active": r[3]} for r in rows]
