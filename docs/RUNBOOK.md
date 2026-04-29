# Runbook

## Starting the stack locally

```bash
make db-up          # start postgres + redis
make db-schema      # run SQL init scripts
make db-seed        # seed default tenant + demo users
make start          # start backend, frontend, auth-service concurrently
```

Visit `http://localhost:3000`. Sign in with `analyst@example.com / Analyst1234!`.

## Resetting the database

```bash
make db-fresh       # drops and recreates all schemas
```

## Running tests

```bash
make test           # backend pytest + frontend vitest
```

## Checking service health

```bash
curl http://localhost:8000/api/health          # backend
curl http://localhost:3001/health              # auth service
```

## Common issues

### `psycopg.OperationalError: connection refused`
PostgreSQL is not running. Run `make db-up` and wait for the healthcheck to pass.

### `401 Unauthorized` on all API requests
The session cookie is missing or expired. Clear browser cookies and sign in again.
The auth service may also be down — check `make auth-service` logs.

### LLM responses failing
Verify `OPENAI_API_KEY` is set in `backend/.env`. The circuit breaker opens after 5 consecutive failures; it resets after 30 seconds automatically.

### RLS errors (`permission denied for table`)
Ensure `db-schema` has been run after any migration. The `appuser` role must have SELECT/INSERT/UPDATE/DELETE granted on all `app.*` tables.

## Logs

- Backend: stdout of `gunicorn` / `uvicorn`
- Auth service: stdout of `node`
- Structured JSON in production; plain text in development

## Scaling

- Backend: increase `-w` workers in `CMD` in `backend/Dockerfile` or adjust HPA in the Helm chart.
- Database connections: tuned via `DB_POOL_MIN` / `DB_POOL_MAX` environment variables.
