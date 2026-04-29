# Architecture Overview

## System Components

| Component | Technology | Port |
|-----------|-----------|------|
| Frontend SPA | React 18 + Vite + TanStack Router | 3000 |
| Backend API | FastAPI (Python 3.13) | 8000 |
| Auth Service | Express + Better Auth | 3001 |
| Database | PostgreSQL 16 + pgvector | 5432 |
| Cache | Redis 7 | 6379 |

## Request Flow

```
Browser → nginx (prod) → /api/* → FastAPI backend
                       → /auth/* → Auth service
```

The backend validates every request by calling the auth service session endpoint (`/auth/session`). Session tokens are cached in-process for 60 seconds using a SHA-256-keyed LRU (2048 entries) with a circuit breaker (5 failures → 30 s open).

## Multi-tenancy

All application tables carry a `tenant_id` column. Row-Level Security (RLS) policies enforce tenant isolation at the database level. The backend sets `app.current_tenant_id` via `SET LOCAL` on each connection before any query runs.

## AI Pipeline

1. Documents are uploaded, validated (MIME + magic bytes), and stored in blob storage.
2. Text is extracted (pdfplumber / PyMuPDF) and embedded with sentence-transformers.
3. Embeddings are stored in pgvector for semantic search.
4. The LLM client wraps the OpenAI-compatible API with 3-retry exponential backoff.
5. Streaming responses are delivered via Server-Sent Events.

## Data Model (key tables)

- `app.assessments` — one per assessment, tracks current wizard step and status
- `app.risks` — identified risks linked to an assessment, with inherent + residual ratings
- `app.controls` — controls linked to risks, with effectiveness rating
- `app.documents` — uploaded supporting documents with embedding status
- `app.chat_messages` — SSE chat history per session
- `app.approvals` — approval workflow records

## Deployment

See the GitOps repository (`risk_control_assessment_agentic_solution_gitops`) for Helm charts, ArgoCD ApplicationSets, and environment-specific value files.
