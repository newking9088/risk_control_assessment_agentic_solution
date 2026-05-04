import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Request, UploadFile, File, HTTPException

from app.config.constants import ALLOWED_MIME_TYPES, MAGIC_BYTES, MAX_FILE_SIZE_BYTES
from app.config.constants import DEFAULT_TENANT_ID
from app.infra.db import get_tenant_cursor
from app.services.document_parser import extract_text
from app.services.chunker import chunk_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/upload", tags=["documents"])

_CAT_COL_EXIST: bool | None = None
_CHUNKS_TABLE_EXIST: bool | None = None
_PARSE_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="doc-parse")


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


async def _check_chunks_table(tenant_id: str) -> bool:
    global _CHUNKS_TABLE_EXIST
    if _CHUNKS_TABLE_EXIST is not None:
        return _CHUNKS_TABLE_EXIST
    try:
        from psycopg.rows import dict_row
        async with get_tenant_cursor(tenant_id, row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT table_name FROM information_schema.tables
                   WHERE table_schema='app' AND table_name='document_chunks'"""
            )
            _CHUNKS_TABLE_EXIST = (await cur.fetchone()) is not None
    except Exception:
        _CHUNKS_TABLE_EXIST = False
    return _CHUNKS_TABLE_EXIST


def _check_magic(content: bytes, mime_type: str) -> bool:
    magic = MAGIC_BYTES.get(mime_type)
    if not magic:
        return False
    return content[:len(magic)] == magic


async def _store_chunks(
    doc_id: str,
    assessment_id: str,
    tenant_id: str,
    category: str,
    content: bytes,
    mime_type: str,
    filename: str,
) -> int:
    """Extract text, chunk it, and insert into document_chunks. Returns chunk count."""
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(
        _PARSE_EXECUTOR,
        extract_text,
        content,
        mime_type,
        filename,
    )
    if not text.strip():
        logger.warning("No text extracted from %r (mime=%s)", filename, mime_type)
        return 0

    chunks = chunk_text(text)
    async with get_tenant_cursor(tenant_id) as cur:
        await cur.executemany(
            """
            INSERT INTO app.document_chunks
              (assessment_id, document_id, tenant_id, chunk_index, category, content)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [
                (assessment_id, doc_id, tenant_id, idx, category, chunk)
                for idx, chunk in enumerate(chunks)
            ],
        )
    return len(chunks)


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

    # Extract text and store chunks (non-blocking; errors are logged, not raised)
    chunk_count = 0
    if await _check_chunks_table(tenant_id):
        try:
            chunk_count = await _store_chunks(
                doc_id, assessment_id, tenant_id,
                category, content, file.content_type, file.filename or "",
            )
        except Exception as exc:
            logger.warning("Chunk storage failed for doc %s: %s", doc_id, exc)

    return {
        "document_id": doc_id,
        "blob_key": blob_key,
        "size": len(content),
        "chunks_stored": chunk_count,
    }
