# Risk & Control Assessment — Agentic Solution

An AI-assisted platform for conducting structured risk and control assessments through a guided 6-step wizard.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, TanStack Router, TanStack Query, Zustand, Recharts |
| Backend | FastAPI, Python 3.13, psycopg3, sentence-transformers, FAISS |
| Auth | Better Auth, Express, PostgreSQL |
| Database | PostgreSQL 16 + pgvector, Redis 7 |
| AI | OpenAI-compatible API (streaming SSE) |

## Quick start

### Prerequisites

- Docker & Docker Compose
- Python 3.13 + [uv](https://github.com/astral-sh/uv)
- Node 22 + npm
- `make`

### Setup

```bash
# 1. Copy environment files
cp backend/.env.example backend/.env
cp auth-service/.env.example auth-service/.env
cp .env.example .env

# 2. Set your OpenAI key (chat degrades gracefully if unset)
# Edit backend/.env and set OPENAI_API_KEY=sk-...

# 3. Install dependencies
make install

# 4. Start DB, apply schema, seed demo users
make db-fresh

# 5. Start all services (auth, backend, frontend)
make start
```

Open `http://localhost:3000` and sign in with one of the demo accounts:

| Email | Password | Role |
|-------|----------|------|
| `analyst@example.com` | `Analyst1234!` | analyst |
| `lead@example.com` | `Lead1234!` | delivery_lead |
| `viewer@example.com` | `Viewer1234!` | viewer |

Service logs are written to `/tmp/rca-{auth,backend,frontend}.log`. Run `make logs` to tail them. Run `make stop` to shut everything down.

## Assessment wizard steps

1. **Preparation** — title, owner, business unit, scope, date
2. **Questionnaire** — governance and operational diagnostic (8 questions)
3. **Identify Risks** — add risks by category and source (EXT/INT)
4. **Inherent Risk** — rate likelihood × impact before controls
5. **Evaluate Controls** — document controls per risk with effectiveness ratings (1–4)
6. **Residual Risk** — re-rate after controls
7. **Summary** — radar chart (inherent vs residual), risk register, PDF export

## Project structure

```
backend/          FastAPI API server
frontend/         React SPA
auth-service/     Session auth service (Better Auth)
db_provisioning/  SQL schema and seed scripts
docs/             Architecture, API reference, runbook, ADRs
.github/          CI workflows, Dependabot, PR template
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Runbook](docs/RUNBOOK.md)
- [ADR 001 — Session auth over JWT](docs/ADR/001-session-auth-over-jwt.md)
- [ADR 002 — PostgreSQL RLS with app.current_tenant_id](docs/ADR/002-postgres-rls-with-app-current-tenant.md)

## Deployment

See the [GitOps repository](https://github.com/newking9088/risk_control_assessment_agentic_solution_gitops) for Kubernetes / ArgoCD deployment.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the security policy and vulnerability reporting.
