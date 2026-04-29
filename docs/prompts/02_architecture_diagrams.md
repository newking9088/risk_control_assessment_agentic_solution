# Section prompt 02 — Architecture diagrams
# Part 3 of 8 | Output file: docs/output/02_architecture_diagrams.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 3 of 8** of the RCA Architecture Document — **Section 2: Architecture diagrams**.

This section is diagram-heavy. Every subsection must contain at least one Mermaid diagram. For subsections that have both Plan A and Plan B variants, show them side-by-side (two diagrams, clearly labelled).

## Repos to read

- `project_setup_prompt.md` — full stack, Helm chart structure, Terraform layout
- `backend/app/` — all service and infra modules
- `deploy/on-premise/helm/` — deployment structure
- `infrastructure/` (IaC repo) — Terraform modules, envs
- `db_provisioning/db/init/` — schema and table names
- `backend/app/middleware/auth.py` — circuit-breaker integration pattern
- `backend/app/infra/blob_storage.py` — object storage integration

## What to produce

Output heading: `## 2. Architecture diagrams`

---

### 2.1 Logical architecture

Produce a **C4 Container diagram** (Mermaid `C4Container` or `flowchart TB`) showing:

**Plan A:**
- React SPA (Vite, `:3000`)
- nginx reverse proxy (`:80/443`) — routes `/api/auth/*` → Auth, `/api/*` → Backend, `/*` → Static
- FastAPI Backend (`:8000`) — central service
- Express Auth Service (Better Auth, `:8001`)
- PostgreSQL 16 + pgvector (`app` schema + `auth` schema)
- Redis 7 (cache, SSE pub/sub, session store)
- FAISS Index (in-process, `backend/app/core/`)
- Object Storage (S3-compatible / Azure Blob, `backend/app/infra/blob_storage.py`)
- Prometheus + Grafana (observability)

**Plan B additions / replacements:**
- AKS / vCluster replaces bare Kubernetes
- Azure PostgreSQL Flexible (pgvector) replaces self-hosted PG
- Azure Cache for Redis
- Azure OpenAI (Cognitive Services) replaces direct OpenAI
- Azure Blob + BYOK replaces S3
- Key Vault for secrets
- Azure Monitor / Log Analytics / App Insights replaces Prometheus stack

---

### 2.2 Physical / deployment architecture

**Plan A — Kubernetes / Helm:**
Produce a deployment diagram (`flowchart LR`) from `deploy/on-premise/helm/`. Show:
- `backend` Deployment (`:8000`, `/api/health` probe)
- `frontend` Deployment (nginx static, `:8080`)
- `auth-service` Deployment (`:8001`, `/health` probe)
- `redis` Deployment
- `ingress` (nginx ingress controller)
- ConfigMaps and Secrets references
- HPA rules

**Plan B — Azure:**
Show Terraform-provisioned resources from `infrastructure/`:
- AKS cluster / vCluster
- Private endpoints for all data-plane resources
- Key Vault (single secret store)
- Log Analytics workspace
- BYOK on PostgreSQL Flexible, Storage Account, Service Bus

Produce a **Plan A vs. Plan B deployment comparison table:**

| Dimension | Plan A | Plan B |
|---|---|---|
| Orchestration | | |
| Database | | |
| Cache | | |
| Secret store | | |
| Observability | | |
| Estimated setup time | | |
| Operator skill required | | |

---

### 2.3 Data architecture

**Conceptual ER diagram** (Mermaid `erDiagram`) — must include all of:
`app.tenants`, `app.assessments`, `app.assessment_risks`, `app.assessment_controls`,
`app.assessment_documents`, `app.assessment_chunks` (pgvector dim 384),
`app.wip_sessions`, `app.chat_messages`, `app.chat_telemetry`,
`app.assessment_qa_answers`, `app.assessment_profile`, `app.assessment_summaries`,
`app.taxonomy_schemas`, `app.schema_change_log`, `app.audit_events`,
`app.approval_requests`, `app.collaborators`, `app.wip_reviewed_*`,
`app.role_config`, `app.notifications`,
`auth.user`, `auth.session`, `auth.account`, `auth.verification`

Split into two diagrams if the single ER becomes unreadable (> 25 entities).

**Physical data distribution table:**

| Store | Technology | Plan A | Plan B | Purpose | Data classification |
|---|---|---|---|---|---|
| Relational + vector | PostgreSQL 16 + pgvector | Self-hosted | Azure PostgreSQL Flexible | Assessments, chunks, audit | Confidential |
| Cache / pub-sub | Redis 7 | Self-hosted | Azure Cache for Redis | SSE fan-out, session cache | Internal |
| Object storage | Blob | S3-compatible | Azure Blob + BYOK | Documents, artifacts | Confidential |
| In-process index | FAISS | In-pod memory | N/A (pgvector used) | Sub-ms vector retrieval | N/A |

**Multi-tenant isolation diagram** — show RLS policy flow:
1. Request arrives with session cookie
2. `backend/app/middleware/auth.py` validates session → extracts `tenant_id`
3. DB cursor sets `set_config('app.current_tenant_id', tenant_id)`
4. PostgreSQL RLS policy filters all `app.*` queries automatically

**FAISS vs. pgvector decision matrix:**

| Criterion | FAISS (Plan A) | pgvector (Plan B) |
|---|---|---|
| Query latency | Sub-millisecond (in-process) | 5–20 ms (network round-trip) |
| Persistence | Rebuild on pod restart | Persistent |
| Multi-tenant filtering | Pre-filter before FAISS query | Native WHERE clause |
| Operational complexity | Low (no extra infra) | Medium (PG extension) |
| Max scale | Single-pod memory limit | PostgreSQL cluster scale |
| Plan | A only | Both (backup in A, primary in B) |

---

### 2.4 AI / agent orchestration architecture

**RAG pipeline flowchart** (Mermaid `flowchart LR`):

```
Upload → Extraction (pdfplumber / PyMuPDF / python-docx / openpyxl)
       → Chunking (backend/app/core/)
       → Embedding (SentenceTransformer paraphrase-MiniLM-L6-v2, dim 384)
       → FAISS Index (Plan A) + app.assessment_chunks pgvector (both plans)
       → Retrieval (k-NN + tenant pre-filter + temporal filter)
       → Prompt construction (backend/app/prompts/)
       → LLM call (OpenAI SDK / LiteLLM / Azure OpenAI)
       → Structured output (respond_json with fallback parse)
       → WIP draft → Analyst review → Approved → Persisted to assessment_*
```

**WIP state machine** (Mermaid `stateDiagram-v2`):
States: `draft` → `reviewed` → `approved` → `saved`
Include: who can trigger each transition; which `app.wip_sessions` and `app.approval_requests` records are written at each step.

**AI service inventory table:**

| Service | File path | Purpose | Inputs | Outputs | Uses LLM? | Autonomy |
|---|---|---|---|---|---|---|
| Risk applicability | `services/risk_applicability/` | Propose which taxonomy risks apply | AU docs, taxonomy | Applicability + rationale per risk | Yes | Proposes; analyst confirms |
| Inherent risk rating | `services/risk_mapping/`, `generate_inherent_risk_ratings` | L × I rating + rationale | Risk, AU context | L score, I score, rationale | Yes | Proposes; analyst confirms |
| Control mapping | `services/risk_mapping/`, `generate_mapped_risks` | Map controls to each risk | Risk list, control library | Risk → control mappings, gap flags | Yes | Proposes; analyst confirms |
| Control effectiveness | `services/scorecard/` | Design + operating effectiveness score | Control, evidence docs | Effectiveness rating + evidence excerpt | Yes | Proposes; analyst confirms |
| Residual risk | `generate_residual_risk` | Compute residual from approved inputs | Approved inherent + effectiveness | Residual score | No (deterministic matrix) | Fully automatic |
| Assessment scorecard | `assessment_au_scorecard` | AU-level summary | All approved ratings | Scorecard + observations | Yes | Draft; analyst edits + signs off |
| Chat assistant | `chatbot/`, `chat_assistant` | RAG-based Q&A on AU docs | User query + retrieved chunks | Streamed answer + chunk citations | Yes | Ephemeral; never auto-persisted |
| QA answers | `risk_questionnaire/`, `qa_answers` | Answer structured risk questionnaire | Questions + AU context | Structured answers | Yes | Proposes; analyst reviews |

---

### 2.5 Integration architecture

**Integration topology diagram** (Mermaid `flowchart TD`) showing:
- Browser → nginx → Backend API / Auth Service / Static Files
- Backend API → Auth Service (HTTP, circuit-breaker in `backend/app/middleware/auth.py`)
- Backend API → OpenAI / LiteLLM / Azure OpenAI (`backend/app/llm_client.py`)
- Backend API → Azure Blob / S3 (`backend/app/infra/blob_storage.py`)
- Backend API → Redis (`backend/app/infra/`) — cache + SSE pub/sub
- Backend API → PostgreSQL (`backend/app/infra/`) — psycopg3 pool

**Integration specifications table:**

| System | Protocol | Auth mechanism | Direction | Sync pattern | Data classification |
|---|---|---|---|---|---|
| Auth Service | HTTP | Session cookie (SHA-256 cache, 60 s TTL) | Backend → Auth | Sync; circuit-breaker after N failures | Session metadata |
| OpenAI / Azure OpenAI | HTTPS REST | API key (Key Vault in Plan B) | Backend → LLM | Async (ThreadPoolExecutor); streaming SSE | Prompt + AU content |
| Azure Blob / S3 | HTTPS | Managed identity (Plan B) / access key | Backend → Storage | Async upload / sync download | Documents (Confidential) |
| Redis | TCP / TLS | Password (env var) | Backend → Redis | Pub/sub (SSE fan-out); get/set (cache) | Session, SSE events (Internal) |
| PostgreSQL | TCP / TLS | psycopg3 pool + RLS | Backend → DB | Sync (parameterized SQL) | All assessment data (Confidential) |

---

### 2.6 Security architecture

**Trust zones diagram** (Mermaid `flowchart LR`) — label each zone:
- `Internet` (untrusted)
- `DMZ` (nginx, TLS termination, CSP headers, rate limiting)
- `Application tier` (Backend API, Auth Service, Frontend static)
- `Data tier` (PostgreSQL, Redis, Blob storage)
- `AI tier` (LLM API, embedding service)
- Arrows: show which zones can call which; block direct internet → data tier

**IAM topology:**
- Better Auth (default) — session-based, httpOnly cookies, sameSite=strict, 8h absolute timeout
- Optional OIDC (`AUTH_PROVIDER=oidc`) — enterprise SSO, MFA delegated to IdP
- `delivery_lead` role requires MFA

**RBAC matrix** (derived from `role` enum and `app.role_config`):

| Capability | `viewer` | `analyst` | `delivery_lead` |
|---|---|---|---|
| View assessments | ✓ | ✓ | ✓ |
| Create / edit assessments | — | ✓ | ✓ |
| Approve AI outputs | — | ✓ | ✓ |
| Manage taxonomy | — | — | ✓ |
| Manage users / roles | — | — | ✓ |
| View audit events | ✓ | ✓ | ✓ |
| Export / reporting | — | ✓ | ✓ |
| Admin console | — | — | ✓ |

**Security controls matrix:**

| Layer | Control | Implementation | Compliance mapping |
|---|---|---|---|
| Transport | TLS everywhere | nginx TLS termination; HSTS header | SOC 2 CC6.7; GDPR Art. 32 |
| Auth | Session-based auth | Better Auth; httpOnly, secure, sameSite=strict | SOC 2 CC6.2 |
| Auth | Account lockout | 5 failures → 15 min lock; `auth:failed_login` audit event | SOC 2 CC6.1 |
| API | RBAC | `require_minimum_role()` on every router | SOC 2 CC6.3 |
| API | Rate limiting | `slowapi` (`backend/app/middleware/rate_limit.py`) | FFIEC |
| API | CSRF protection | Double-submit cookie (`backend/app/middleware/csrf.py`) | OWASP |
| Input | File upload validation | MIME allowlist + magic-byte check + 50 MB limit + AV scan | SOC 2 CC6.6 |
| Input | Prompt injection prevention | `bleach` sanitization before LLM call | SR 11-7 §III |
| Output | XSS prevention | `DOMPurify` on all AI-generated HTML (frontend) | SOC 2 CC6.6 |
| Data | Multi-tenant isolation | RLS via `set_config` | GDPR Art. 32; SOC 2 CC6.3 |
| Data | Secrets management | Env vars / Key Vault (Plan B); never in code | SOC 2 CC6.1 |
| Data | BYOK (Plan B) | Azure Key Vault CMK on PG, Blob, Service Bus | GDPR Art. 32; SOC 2 CC6.7 |
| Audit | Full provenance | `app.audit_events`, `app.chat_telemetry` | SR 11-7 §III; SOX ICFR |

---

### 2.7 Key workflow sequence diagrams

Produce one `sequenceDiagram` per flow. Participants: `Browser`, `nginx`, `Backend`, `AuthService`, `Redis`, `PostgreSQL`, `FAISS/pgvector`, `LLM`, `BlobStorage`.

**Flow 1 — New assessment + document upload + chunking/embedding**
Steps: login → create assessment → upload document → validate (MIME + magic bytes + size) → store blob → extract text → chunk → embed → store FAISS + pgvector → return SSE progress events → `assessment_documents` record created.

**Flow 2 — Risk applicability generation with QA run and analyst edit**
Steps: analyst triggers applicability → backend calls `services/risk_applicability/` → retrieve chunks (FAISS / pgvector) → construct prompt (`backend/app/prompts/`) → LLM call → parse structured output → store as WIP draft in `app.wip_sessions` → SSE stream to browser → analyst reviews + edits → analyst approves → `assessment_risks` written → `audit_events` written.

**Flow 3 — Inherent risk + controls + residual rating + approval request**
Steps: inherent ratings generated → analyst approves per risk → control mapping generated → analyst reviews control-gap flags → control effectiveness scored → analyst approves → residual risk computed deterministically (no LLM) → approval request created in `app.approval_requests` → 2nd-line reviewer notified → reviewer approves or rejects → `assessment_risks` + `assessment_controls` finalised.

**Flow 4 — Chat assistant streamed response**
Steps: analyst types question → backend retrieves top-k chunks (FAISS / pgvector, tenant pre-filter) → constructs prompt with context window budget (tiktoken) → LLM streaming call → SSE stream tokens to browser → `app.chat_messages` + `app.chat_telemetry` written (ephemeral — not persisted to assessment record unless analyst explicitly promotes).

## Output requirements

- Output file: `docs/output/02_architecture_diagrams.md`
- Start with `## 2. Architecture diagrams`
- Every subsection must contain at least one Mermaid diagram
- End with `---`
