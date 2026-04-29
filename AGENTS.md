# AGENTS.md

Guidelines for AI coding agents working in this repository.

## Repository layout

```
backend/          FastAPI application (Python 3.13 + uv)
frontend/         React SPA (Vite + TanStack Router)
auth-service/     Better Auth Express service (Node 22)
db_provisioning/  SQL init scripts for PostgreSQL
docs/             Architecture, runbook, API reference, ADRs
```

## Key conventions

- **Backend:** All routes live in `backend/app/routes/`. Add new routers in `main.py` lifespan. Use `get_tenant_cursor()` for every DB query — never bypass RLS.
- **Frontend:** Routes go in `frontend/src/routes/`. Wizard steps go in `frontend/src/features/wizard/steps/`. Each step receives `{ assessmentId, onValidChange }` props and must call `onValidChange(true)` when the step is complete.
- **Auth:** Do not modify session validation logic in `backend/app/middleware/auth.py` without updating the circuit breaker thresholds to match.
- **Migrations:** SQL changes go in `db_provisioning/db/init/` with a sequential prefix. Always include RLS policies for new `app.*` tables.

## Testing

```bash
make test    # runs backend pytest and frontend vitest
```

Do not mock the database in integration tests — use the real PostgreSQL instance started by `make db-up`.

## Security

- Never log session tokens, passwords, or PII.
- Validate file uploads using both MIME type and magic bytes (`backend/app/config/constants.py`).
- All user-supplied HTML must be sanitised with DOMPurify before rendering.
