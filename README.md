# Risk & Control Assessment — Agentic Solution

An AI-assisted platform for conducting structured risk and control assessments through a guided 7-step wizard. Analysts identify risks, rate inherent and residual risk, evaluate controls, and export a PDF risk register — with LLM assistance throughout.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, TanStack Router, TanStack Query, Zustand, Recharts |
| Backend | FastAPI, Python 3.13, psycopg3, sentence-transformers, FAISS |
| Auth | Better Auth v1.2, Express, Node 22 |
| Database | PostgreSQL 16 + pgvector, Redis 7 |
| AI | OpenAI-compatible API (streaming SSE) |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker Desktop | latest | must be running |
| Python | 3.13 | |
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | latest | Python package manager |
| Node.js | 22 | |
| npm | 10+ | bundled with Node 22 |
| make | any | Git Bash / WSL on Windows |

> **Windows users:** `make` requires [Git Bash](https://git-scm.com/downloads) or WSL. All commands below assume a bash-compatible shell.

---

## Local setup

### 1. Clone and enter the repo

```bash
git clone https://github.com/newking9088/risk_control_assessment_agentic_solution.git
cd risk_control_assessment_agentic_solution
```

### 2. Copy environment files

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp auth-service/.env.example auth-service/.env
```

The defaults work out of the box for local development. The only value you may want to set is `OPENAI_API_KEY` in `backend/.env` — AI features degrade gracefully if it is unset.

```bash
# Optional: enable LLM features
# Edit backend/.env and set:
# OPENAI_API_KEY=sk-...
```

### 3. Generate a Better Auth secret

Replace the placeholder in `auth-service/.env`:

```bash
# Paste the output into auth-service/.env as BETTER_AUTH_SECRET=<value>
openssl rand -hex 32
```

### 4. Install dependencies

```bash
make install
```

This runs `uv sync --extra dev` for the backend, `npm ci` for the frontend, and `npm ci` for the auth service.

### 5. Start the database, apply schema, seed demo users

```bash
make db-fresh
```

This will:
- Stop any existing containers (`docker compose down`)
- Start PostgreSQL 16 + pgvector and Redis 7
- Wait for the database to be healthy
- Apply `db_provisioning/db/init/001_app_schema.sql` and `002_auth_schema.sql`
- Seed three demo users via the auth service

> If `db-fresh` fails on the seed step, the database container may not have been ready in time. Run `make db-seed` separately once `docker compose ps` shows the db container as `healthy`.

### 6. Start all services

```bash
make start
```

This starts three processes in the background:

| Service | URL | Log |
|---------|-----|-----|
| Frontend (Vite) | http://localhost:3000 | `/tmp/rca-frontend.log` |
| Backend (FastAPI) | http://localhost:8000 | `/tmp/rca-backend.log` |
| Auth service (Express) | http://localhost:3001 | `/tmp/rca-auth.log` |

Allow 5–10 seconds for all services to finish starting.

### 7. Open the app

Navigate to **http://localhost:3000** and sign in with a demo account:

| Email | Password | Role |
|-------|----------|------|
| `analyst@example.com` | `Analyst1234!` | analyst |
| `lead@example.com` | `Lead1234!` | delivery_lead |
| `viewer@example.com` | `Viewer1234!` | viewer |

---

## Day-to-day commands

```bash
make start        # start all services (also starts DB if not running)
make stop         # stop services and containers
make logs         # tail all service logs
make ps           # show container and process status
make test         # run backend (pytest) and frontend (vitest) tests
make lint         # ruff + black check (backend), eslint (frontend + auth)
make db-fresh     # full DB reset: wipe, re-apply schema, re-seed
make fresh        # full reset: stop everything, wipe DB, restart
make help         # list all available targets
```

### Useful URLs when running locally

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Frontend app |
| http://localhost:8000/api/docs | FastAPI Swagger UI |
| http://localhost:8000/api/health | Backend health check |
| http://localhost:3001/api/auth | Better Auth base URL |

---

## Assessment wizard steps

1. **Preparation** — title, owner, business unit, scope, date
2. **Questionnaire** — governance and operational diagnostic (8 questions)
3. **Identify Risks** — add risks by category and source (EXT/INT)
4. **Inherent Risk** — rate likelihood × impact before controls
5. **Evaluate Controls** — document controls per risk with effectiveness ratings (1–4)
6. **Residual Risk** — re-rate after controls
7. **Summary** — radar chart (inherent vs residual), risk register, PDF export

---

## Project structure

```
backend/              FastAPI API server (Python 3.13, psycopg3)
frontend/             React SPA (Vite, TanStack Router)
auth-service/         Session auth service (Better Auth, Express)
db_provisioning/
  db/init/            SQL schema files applied on first container start
    001_app_schema.sql   app.* tables, RLS policies, grants
    002_auth_schema.sql  auth.* tables (Better Auth schema)
  seed/               Seed scripts
docs/                 Architecture, API reference, runbook, ADRs
.github/
  workflows/          CI (lint/test/build) and CD (GHCR + 4-env deploy)
  CONTRIBUTING.md     Branch model, commit style, PR flow
Makefile              All dev commands
docker-compose.yml    DB + Redis for local development
```

---

## Troubleshooting

**`make db-schema` fails with "could not connect to server"**
The DB container is not yet healthy. Wait a moment and retry, or run `docker compose ps` to check its status.

**`make db-seed` fails with "connection refused" on port 3001**
The auth service must be running before seeding. Run `make start` first, wait ~5 seconds, then run `make db-seed`.

**`make start` fails on Windows with "command not found: make"**
Open Git Bash (not PowerShell or CMD) and retry.

**Login fails with "invalid credentials" after `make db-fresh`**
The seed may have run before the auth service was ready. Run `make db-seed` again.

**FastAPI docs return 404**
Check `ENABLE_DOCS=true` is set in `backend/.env`.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Runbook](docs/RUNBOOK.md)
- [ADR 001 — Session auth over JWT](docs/ADR/001-session-auth-over-jwt.md)
- [ADR 002 — PostgreSQL RLS with app.current_tenant_id](docs/ADR/002-postgres-rls-with-app-current-tenant.md)

## Deployment

See the [GitOps repository](https://github.com/newking9088/risk_control_assessment_agentic_solution_gitops) for Kubernetes / ArgoCD deployment manifests.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.
