import uuid
from fastapi import APIRouter, Request, UploadFile, File, HTTPException

from app.config.constants import ALLOWED_MIME_TYPES, MAGIC_BYTES, MAX_FILE_SIZE_BYTES
from app.config.constants import DEFAULT_TENANT_ID
from app.infra.db import get_tenant_cursor

router = APIRouter(prefix="/v1/upload", tags=["documents"])

_CAT_COL_EXIST: bool | None = None


async def _check_cat_col(tenant_id: str) -> bool:
    global _CAT_COL_EXIST
    if _CAT_COL_EXIST is not None:
        return _CAT_COL_EXIST
    try:
        from psycopg.rows import dict_row
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='app' AND table_name='assessment_documents'
                     AND column_name='category'"""
            )
            _CAT_COL_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _CAT_COL_EXIST = False
    return _CAT_COL_EXIST


def _check_magic(content: bytes, mime_type: str) -> bool:
    magic = MAGIC_BYTES.get(mime_type)
    if not magic:
        return False
    return content[:len(magic)] == magic


@router.post("")
async def upload_document(
    assessment_id: str,
    request: Request,
    file: UploadFile = File(...),
    category: str = "au_description",
):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, "File type not allowed")

    header = await file.read(512)
    if not _check_magic(header, file.content_type):
        raise HTTPException(400, "File content does not match declared type")

    rest = await file.read()
    content = header + rest
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(413, "File too large (max 50 MB)")

    user = request.state.user
    tenant_id = user.get("tenantId", DEFAULT_TENANT_ID)
    doc_id = str(uuid.uuid4())
    blob_key = f"{tenant_id}/{assessment_id}/{doc_id}/{file.filename}"
    has_cat = await _check_cat_col(tenant_id)

    async with get_tenant_cursor(tenant_id) as cur:
        if has_cat:
            await cur.execute(
                "INSERT INTO app.assessment_documents "
                "(id, assessment_id, blob_key, filename, mime_type, blob_size_bytes, uploaded_by, category) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (doc_id, assessment_id, blob_key, file.filename,
                 file.content_type, len(content), user["id"], category),
            )
        else:
            await cur.execute(
                "INSERT INTO app.assessment_documents "
                "(id, assessment_id, blob_key, filename, mime_type, blob_size_bytes, uploaded_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (doc_id, assessment_id, blob_key, file.filename,
                 file.content_type, len(content), user["id"]),
            )

    return {"document_id": doc_id, "blob_key": blob_key, "size": len(content)}
