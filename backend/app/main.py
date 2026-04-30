from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config.settings import get_settings
from app.errors import AppError, app_error_handler, generic_error_handler
from app.infra.db import init_db_pool, close_db_pool
from app.infra.redis_client import init_redis, close_redis
from app.middleware.permissions import require_minimum_role
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes import assessments, documents, risks, controls, approvals, chat, health, admin, settings as settings_route, controls_catalog, taxonomy_management
from app.routes.risks import agent_router

settings = get_settings()
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit_default])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_pool()
    await init_redis()
    yield
    await close_db_pool()
    await close_redis()


app = FastAPI(
    title="RCA Platform API",
    version="1.0.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    lifespan=lifespan,
)

# ── Middleware (last-added runs first) ────────────────────────
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate limiter ──────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Error handlers ────────────────────────────────────────────
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, generic_error_handler)

# ── Routers ───────────────────────────────────────────────────
app.include_router(health.router, prefix="/api")

viewer_dep = Depends(require_minimum_role("viewer"))
analyst_dep = Depends(require_minimum_role("analyst"))
lead_dep = Depends(require_minimum_role("delivery_lead"))

app.include_router(assessments.router, prefix="/api", dependencies=[viewer_dep])
app.include_router(documents.router,   prefix="/api", dependencies=[analyst_dep])
app.include_router(risks.router,       prefix="/api", dependencies=[analyst_dep])
app.include_router(controls.router,    prefix="/api", dependencies=[analyst_dep])
app.include_router(approvals.router,   prefix="/api", dependencies=[analyst_dep])
app.include_router(chat.router,        prefix="/api", dependencies=[viewer_dep])
app.include_router(admin.router,        prefix="/api", dependencies=[lead_dep])
app.include_router(settings_route.router,    prefix="/api", dependencies=[viewer_dep])
app.include_router(controls_catalog.router,    prefix="/api", dependencies=[viewer_dep])
app.include_router(taxonomy_management.router, prefix="/api", dependencies=[viewer_dep])
app.include_router(agent_router,       prefix="/api", dependencies=[analyst_dep])

# ── Prometheus metrics (optional) ─────────────────────────────
if settings.enable_metrics:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app)
