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
# 1. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env and fill in OPENAI_API_KEY and other required values

# 2. Start the database and cache
make db-up

# 3. Apply schema and seed demo data
make db-schema db-seed

# 4. Install dependencies
make install

# 5. Start all services
make start
```

Open `http://localhost:3000` and sign in with:
- `admin@example.com` / `Admin1234!`
- `manager@example.com` / `Manager1234!`
- `analyst@example.com` / `Analyst1234!`

## Assessment wizard steps

1. **Start Assessment** — title, scope, and date
2. **Identify Risks** — add risks by category
3. **Inherent Risk Rating** — likelihood × impact before controls
4. **Evaluate Controls** — document controls per risk with effectiveness rating
5. **Residual Risk** — re-rate after controls
6. **Assessment Summary** — radar chart, risk register, PDF export

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

## Deployment

See the [GitOps repository](https://github.com/newking9088/risk_control_assessment_agentic_solution_gitops) for Kubernetes / ArgoCD deployment.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the security policy and vulnerability reporting.
