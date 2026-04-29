import uuid
from fastapi import APIRouter, Request
from pydantic import BaseModel
from app.infra.db import get_tenant_cursor
from app.config.constants import DEFAULT_TENANT_ID
from app.errors import NotFoundError

router = APIRouter(prefix="/v1/approvals", tags=["approvals"])


class ApprovalRequest(BaseModel):
    assessment_id: str
    step: str


@router.post("")
async def request_approval(body: ApprovalRequest, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    approval_id = str(uuid.uuid4())
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "INSERT INTO app.approval_requests (id, assessment_id, step, requested_by) "
            "VALUES (%s, %s, %s, %s)",
            (approval_id, body.assessment_id, body.step, user["id"]),
        )
    return {"approval_request_id": approval_id}


@router.post("/{approval_id}/approve")
async def approve(approval_id: str, request: Request):
    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.execute(
            "UPDATE app.approval_requests SET status = 'approved', approved_by = %s "
            "WHERE id = %s",
            (user["id"], approval_id),
        )
        if cur.rowcount == 0:
            raise NotFoundError("approval_request")
    return {"approved": True}
