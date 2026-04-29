# Runbook

## Starting the stack locally

```bash
cp backend/.env.example backend/.env
cp auth-service/.env.example auth-service/.env
cp .env.example .env
make install
make db-fresh        # wipes DB, applies schema, seeds demo users
make start           # starts auth (3001), backend (8000), frontend (3000)
```

Visit `http://localhost:3000`. Demo logins:

| Email | Password | Role |
|-------|----------|------|
| `analyst@example.com` | `Analyst1234!` | analyst |
| `lead@example.com` | `Lead1234!` | delivery_lead |
| `viewer@example.com` | `Viewer1234!` | viewer |

## Make targets

| Target | Description |
|--------|-------------|
| `make install` | Install all dependencies (uv, npm) |
| `make db-up` | Start DB and Redis containers only |
| `make db-fresh` | Full DB reset: down → up → schema → seed |
| `make db-schema` | Apply SQL init files via `docker exec rca-db` |
| `make db-seed` | Seed demo users via `auth-service/src/seed.ts` |
| `make start` | Start auth, backend, frontend in background |
| `make stop` | Kill all services and `docker compose down` |
| `make logs` | Tail `/tmp/rca-{auth,backend,frontend}.log` |
| `make ps` | Show running containers and processes |
| `make fresh` | Full reset: stop → db-fresh → start |
| `make test` | Run backend pytest + frontend vitest |
| `make lint` | Run ruff/black (backend) + eslint (frontend) |
| `make help` | Print all targets with descriptions |

## Log locations

| Service | Log file |
|---------|----------|
| Backend (uvicorn) | `/tmp/rca-backend.log` |
| Auth service (tsx) | `/tmp/rca-auth.log` |
| Frontend (vite) | `/tmp/rca-frontend.log` |

## Resetting the database

```bash
make db-fresh       # drops volumes, recreates schemas, re-seeds
```

## Running tests

```bash
make test           # backend pytest + frontend vitest --run
```

## Checking service health

```bash
curl http://localhost:8000/api/health    # backend → {"status":"ok"}
curl http://localhost:3001/health        # auth    → {"status":"ok"}
```

## Common issues

### `psycopg.OperationalError: connection refused`
PostgreSQL is not running. Run `make db-up` and wait for the healthcheck:
```bash
until docker exec rca-db pg_isready -U adminuser -d appdb -q; do sleep 1; done
```

### `401 Unauthorized` on all API requests
Session cookie missing or expired. Clear browser cookies and sign in again. Confirm the auth service is running: `make logs`.

### `403 Forbidden`
The signed-in user's role is below the minimum required for that endpoint. Check `docs/API.md` for required roles.

### RLS errors (`permission denied for table`)
Run `make db-schema` to re-apply grants. The `adminuser` role must have `ALL ON ALL TABLES IN SCHEMA app`.

### LLM responses failing
Verify `OPENAI_API_KEY` is set in `backend/.env`. The platform degrades gracefully — wizard CRUD still works without an API key.

## Scaling

- Backend: increase `-w` workers in `CMD` in `backend/Dockerfile` or adjust HPA in the Helm chart.
- Database connections: tuned via `DB_POOL_MIN` / `DB_POOL_MAX` environment variables.
