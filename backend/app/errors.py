from fastapi import Request
from fastapi.responses import JSONResponse
import uuid
import logging

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, resource: str):
        super().__init__(f"{resource.upper()}_NOT_FOUND", f"{resource} not found", 404)


class ForbiddenError(AppError):
    def __init__(self):
        super().__init__("FORBIDDEN", "Insufficient permissions", 403)


class UnauthorizedError(AppError):
    def __init__(self):
        super().__init__("UNAUTHORIZED", "Authentication required", 401)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    correlation_id = str(uuid.uuid4())[:8]
    logger.exception("Unhandled error [%s]", correlation_id)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "correlation_id": correlation_id}},
    )
