# Section prompt 03 — Technical specifications
# Part 4 of 8 | Output file: docs/output/03_technical_specifications.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 4 of 8** of the RCA Architecture Document — **Section 3: Technical specifications**.

This is the most code-dense section. Every claim must be grounded in actual files. Do not describe what the code should do — describe what it does do, citing the exact path.

## Repos to read

- `backend/app/` — all submodules: `routes/`, `services/`, `middleware/`, `prompts/`, `core/`, `infra/`, `migrations/`, `llm_client.py`, `main.py`, `config/settings.py`
- `frontend/src/` — `routes/`, `features/`, `stores/`, `hooks/`, `components/`
- `auth-service/src/`
- `db_provisioning/db/init/` — schema SQL files

## What to produce

Output heading: `## 3. Technical specifications`

---

### 3.1 UI layer architecture

**Layer / responsibility / technology table:**

| Layer | Responsibility | Technology | Key files |
|---|---|---|---|
| Routing | Page navigation, auth guards, lazy loading | TanStack Router | `frontend/src/routes/routeTree.tsx` |
| Server state | API data fetching, cache, invalidation | TanStack Query | `frontend/src/features/*/api/` |
| UI state / wizard | Current step, risk arrays, draft edits | Zustand | `frontend/src/stores/` |
| Auth session | Login/logout, session, user info | better-auth/react | `frontend/src/hooks/` |
| UI components | Design system, forms | Shadcn/ui + SCSS | `frontend/src/components/` |
| Real-time | SSE event consumption → Query invalidation | Native EventSource | `frontend/src/hooks/useSSE*` |
| Charts / export | Risk score charts, PDF export | Recharts, jsPDF | `frontend/src/features/fraud/` |
| Security | XSS prevention on AI-generated HTML | DOMPurify | All AI-output render sites |

**Application shell diagram** (Mermaid `flowchart TB`) — show top-level layout:
Navbar → [Dashboard, 7-step wizard, Admin console, `AlChatWidget`]

**7-step wizard navigation** (Mermaid `stateDiagram-v2`):
Steps: `Start assessment` → `Identify risks` → `Inherent risk rating` → `Evaluate controls` → `Residual risk` → `Assessment summary` → `Sign-off`
Each step: lazy-loaded route; `stepValidation` gates Continue button; supports read-only mode (`?assessment_id=`).

**Module feature matrix:**

| Module | Features | SSE events consumed | Auth guard |
|---|---|---|---|
| Dashboard | Assessment list, status, KPI widgets | None | viewer |
| AI wizard | 7-step workflow, AI generation, edit | `risk:progress`, `risk:complete` | analyst |
| Evidence manager | Document upload, chunk preview | `upload:progress` | analyst |
| Chat | RAG chatbot, stream response | `chat:token`, `chat:done` | viewer |
| Admin console | Taxonomy management, user RBAC, tenant config | None | delivery_lead |

**State management strategy:**

| State type | Tool | Why not the other |
|---|---|---|
| Server state (API responses) | TanStack Query | Cache, stale-while-revalidate, SSE-triggered invalidation |
| UI / wizard state | Zustand | Synchronous, no async overhead for in-memory wizard steps |
| Auth session | better-auth/react | Dedicated hook; auth state must not pollute server cache |
| URL / navigation state | TanStack Router search params | Shareable links; back-button safe |

**Real-time update patterns:**
SSE event → `useSSE` hook → `queryClient.invalidateQueries(key)` or optimistic update → React re-render.
Redis pub/sub (backend) → SSE endpoint → browser EventSource.

**Frontend security rules (non-negotiable):**
- Never `dangerouslySetInnerHTML` — use `DOMPurify.sanitize()` if raw HTML is unavoidable
- No tokens, session data, or PII in `localStorage` / `sessionStorage`
- External links: `rel="noopener noreferrer"`
- CSP enforced at nginx level (see Section 2.6); do not rely on meta tags
- Every major route wrapped in `<ErrorBoundary>` — no raw stack traces to users
- WCAG 2.1 AA: keyboard navigation, `alt` text, contrast ≥ 4.5:1, semantic HTML

---

### 3.2 Backend / service decomposition

**Architecture reality statement:** The backend is a FastAPI semi-monolith with 25+ routers grouped by RBAC level. This is intentional for the current scale — the section documents the actual factual structure and the future microservices split path.

**FastAPI app setup** (from `backend/app/main.py`):

```python
app = FastAPI(root_path="/api", lifespan=lifespan)
# Middleware — last-added runs first:
# SessionFlushMiddleware → SecurityHeadersMiddleware → CSRFMiddleware
# → CORSMiddleware → SlowAPIRateLimitMiddleware
app.include_router(read_router,  dependencies=[Depends(require_minimum_role("viewer"))])
app.include_router(write_router, dependencies=[Depends(require_minimum_role("analyst"))])
app.include_router(admin_router, dependencies=[Depends(require_minimum_role("delivery_lead"))])
```

**Service / router catalog table** — fill every row:

| Router / service | File path | Owns data (tables) | Sync APIs | Events published | Events consumed |
|---|---|---|---|---|---|
| `session_snapshot` | `backend/app/routes/` | `app.wip_sessions` | | | |
| `new_assessment` | | `app.assessments` | | | |
| `risk_control_upload` | | `app.assessment_documents` | | `upload:progress` | |
| `risk_applicability` | | `app.assessment_risks` (draft) | | `risk:progress`, `risk:complete` | |
| `generate_inherent_risk_ratings` | | `app.assessment_risks` | | | |
| `generate_mapped_risks` | | `app.assessment_controls` (draft) | | | |
| `generate_residual_risk` | | `app.assessment_risks` (residual) | | | |
| `chat_assistant` | `backend/app/chatbot/` | `app.chat_messages`, `app.chat_telemetry` | | `chat:token`, `chat:done` | |
| `chatbot` | | `app.chat_messages` | | | |
| `assessment_mu_scorecard` | | `app.assessment_summaries` | | | |
| `assessment_persistence` | | All `app.assessment_*` | | | |
| `au_profile` | | `app.assessment_profile` | | | |
| `clarifications` | | `app.wip_sessions` | | | |
| `qa_answers` | `backend/app/risk_questionnaire/` | `app.assessment_qa_answers` | | | |
| `llm_models` | | None (passthrough) | | | |
| `llm_health` | | None | | | |
| `taxonomy_schema` | | `app.taxonomy_schemas` | | | |
| `taxonomy_management` | | `app.taxonomy_schemas`, `app.schema_change_log` | | | |
| `audit_events` | | `app.audit_events` | | | |
| `sse_events` | `backend/app/routes/sse_events.py` | None (Redis sub) | | | SSE fan-out from Redis |
| `tenant_config` | | `app.tenants` | | | |
| `approvals` | | `app.approval_requests` | | | |
| `role_config` | | `app.role_config` | | | |
| `collaborators` | | `app.collaborators` | | | |
| `notifications` | | `app.notifications` | | | |

**Communication patterns:**

| Pattern | Technology | When used |
|---|---|---|
| Sync REST | FastAPI + psycopg3 | CRUD, reads, admin operations |
| Real-time streaming | SSE (`sse_events.py`) | AI generation progress, chat token streaming |
| Background jobs | Redis pub/sub + ThreadPoolExecutor | LLM calls (non-blocking), embedding generation |
| Async queue (Plan B) | Azure Service Bus | Long-running LLM batch jobs |

**API design principles:**
- Versioning: all routes under `/v1/` inside `root_path="/api"` → public path `/api/v1/...`
- Error format: RFC 7807 — `{"error": {"code": "ASSESSMENT_NOT_FOUND", "message": "..."}}`; 500s return only `{"error": {"code": "INTERNAL_ERROR", "correlation_id": "..."}}`
- Pagination: cursor-based on `audit_events`, `notifications`
- Idempotency: POST endpoints for AI generation use `wip_session_id` as idempotency key
- Rate limiting: `slowapi` on all LLM generation endpoints (`backend/app/middleware/rate_limit.py`)
- CSRF: double-submit cookie pattern (`backend/app/middleware/csrf.py`)
- OpenAPI docs: disabled in production (`docs_url=None, redoc_url=None`) or gated behind `delivery_lead` role

**Auth integration pattern** (from `backend/app/middleware/auth.py`):
1. Check in-memory cache (SHA-256 of cookies, 60 s TTL, 2048 entries max)
2. On miss: `httpx.get(AUTH_SERVICE_URL + "/api/auth/get-session", cookies=request.cookies)`
3. Circuit breaker: after N failures, open for 30 s — serve from cache only
4. Extract `user_id`, `user_name`, `tenant_id`, `role`

---

### 3.3 Data model

**Detailed entity table** — every entity from `db_provisioning/db/init/`:

| Entity | Key attributes | Relationships | Data classification | Retention |
|---|---|---|---|---|
| `app.tenants` | `id`, `name`, `slug`, `config` | Parent of all `app.*` | Internal | Permanent |
| `app.assessments` | `id`, `tenant_id`, `au_name`, `status`, `created_by`, `created_at` | Parent of risks, controls, docs | Confidential | 7 years (SOX) |
| `app.assessment_risks` | `id`, `assessment_id`, `risk_id`, `applicability`, `inherent_l`, `inherent_i`, `residual`, `rationale`, `approved_by` | Child of assessments, parent of controls | Confidential | 7 years |
| `app.assessment_controls` | `id`, `risk_id`, `control_id`, `design_eff`, `operating_eff`, `evidence_ref`, `approved_by` | Child of risks | Confidential | 7 years |
| `app.assessment_documents` | `id`, `assessment_id`, `blob_key`, `mime_type`, `extracted_text`, `chunk_count` | Child of assessments | Confidential | 7 years |
| `app.assessment_chunks` | `id`, `document_id`, `tenant_id`, `content`, `embedding` (vector 384), `chunk_index` | Child of documents; queried by pgvector | Confidential | 7 years |
| `app.wip_sessions` | `id`, `assessment_id`, `step`, `state` (draft/reviewed/approved/saved), `data` (JSONB) | Child of assessments | Confidential | 90 days active; archived |
| `app.audit_events` | `id`, `tenant_id`, `user_id`, `event_type`, `entity_id`, `prompt`, `chunks`, `model`, `confidence`, `timestamp` | References all entities | Confidential | 7 years |
| `app.approval_requests` | `id`, `assessment_id`, `step`, `requested_by`, `approved_by`, `status`, `timestamp` | Child of assessments | Confidential | 7 years |
| `app.chat_messages` | `id`, `session_id`, `role`, `content`, `timestamp` | Child of wip_sessions | Internal | 90 days |
| `app.chat_telemetry` | `id`, `session_id`, `model`, `tokens_in`, `tokens_out`, `latency_ms`, `retrieved_chunks` | Child of chat_messages | Internal | 1 year |
| `app.taxonomy_schemas` | `id`, `tenant_id`, `name`, `version`, `schema` (JSONB), `active` | Parent of risks | Internal | Permanent + change log |
| `app.schema_change_log` | `id`, `taxonomy_id`, `changed_by`, `diff`, `timestamp` | Child of taxonomy_schemas | Internal | Permanent |

**Data retention & lifecycle:**

| Category | Active period | Archive trigger | Deletion rule |
|---|---|---|---|
| Assessment records | Until sign-off + 7 years | Assessment closed | SOX: 7-year minimum; GDPR right-to-erasure with legal-hold exception |
| WIP / drafts | 90 days | Assessment approved | Auto-purge after 90 days if not promoted |
| Chat messages | 90 days | Session closed | Auto-purge; SSE trace in `chat_telemetry` retained 1 year |
| Audit events | Permanent | N/A | Legal-hold support; never deleted without compliance approval |
| Embeddings | Lifetime of document | Document deleted | Cascade delete on `assessment_documents` |

**Vector storage strategy:**

| Content type | Source | Extraction library | Embedding model | Dimensions | Index type | Chunking | Use case |
|---|---|---|---|---|---|---|---|
| PDF documents | `assessment_documents` | `pdfplumber`, `PyMuPDF` (OCR fallback: `pytesseract`) | `paraphrase-MiniLM-L6-v2` | 384 | FAISS (A) / pgvector (B) | 512 tokens, 64 overlap | Risk applicability, QA |
| Word documents | `assessment_documents` | `python-docx` | Same | 384 | Same | Same | Same |
| Excel / spreadsheets | `assessment_documents` | `openpyxl`, `pandas` | Same | 384 | Same | Row-based | Control evidence |

---

### 3.4 AI / agent architecture

**Framework selection table:**

| Concern | Plan A | Plan B |
|---|---|---|
| LLM provider | OpenAI SDK direct (`backend/app/llm_client.py`) | Azure OpenAI via Cognitive Services |
| Fallback / multi-provider | LiteLLM lazy-loaded | LiteLLM optional |
| Embeddings | SentenceTransformer `paraphrase-MiniLM-L6-v2` (local) | Same (or Azure AI Search embeddings) |
| RAG orchestration | In-house (no LangChain / LlamaIndex) | Same |
| Agent framework | None — deterministic services + LLM calls | Same |
| Vector retrieval | FAISS (in-process) | pgvector (Azure PG) |

**Why no agent framework (LangChain / LlamaIndex):**
Each AI service in the platform is a narrow, single-purpose function (applicability, rating, mapping). Using a full agent framework would add dependency weight, non-determinism, and debug complexity that is not justified. The `respond_text` / `respond_json` abstraction in `backend/app/llm_client.py` provides the needed retry, fallback, and multi-provider routing.

**`respond_json` fallback strategy** (from `backend/app/llm_client.py`):
1. Try with `response_format=json_object`
2. Fallback: call without `response_format`, parse JSON from response text
3. Validate against `output_schema` if provided
4. Return `{}` on final failure; log model + prompt + error to `audit_events`

**Model selection table** (cite `_DEFAULT_MODELS` in `backend/app/llm_client.py`):

| Use case | Primary model | Fallback | Why |
|---|---|---|---|
| Risk applicability reasoning | | | |
| Inherent risk rating | | | |
| Control mapping | | | |
| Chat assistant | | | |
| Summarization (assessment summary) | | | |
| Embeddings | `paraphrase-MiniLM-L6-v2` (local) | N/A | No external API dependency; deterministic |

**Tool registry** (functions callable from the chat/RAG layer):

| Tool name | Description | Input | Output |
|---|---|---|---|
| `retrieve_chunks` | k-NN retrieval from FAISS / pgvector | query text, tenant_id, top_k | List of chunk objects with text + score |
| `get_au_profile` | Fetch AU business process summary | assessment_id | Profile object |
| `get_taxonomy` | Fetch active taxonomy for tenant | tenant_id | Taxonomy schema |
| `web_search` | DuckDuckGo search for external context | query string | Search result snippets |

---

### 3.5 RAG implementation

**End-to-end RAG pipeline diagram** (Mermaid `flowchart LR`) — include every component:
Upload → Extraction → Chunking (configurable size/overlap) → Embedding (SentenceTransformer, dim 384) → Store: FAISS index (Plan A) + pgvector `app.assessment_chunks` (both plans) → Query time: retrieve top-k → tenant pre-filter → temporal filter → RRF hybrid (semantic + FTS keyword) → context window budget (tiktoken) → prompt construction (`backend/app/prompts/`) → LLM call → structured output.

**Content types × chunking strategy:**

| Content type | Extraction library | Chunk size | Overlap | Embedding refresh | Use case |
|---|---|---|---|---|---|
| PDF (text) | `pdfplumber` | 512 tokens | 64 tokens | On re-upload | Applicability, QA |
| PDF (scanned) | `PyMuPDF` + `pytesseract` | 512 tokens | 64 tokens | On re-upload | Same |
| Word (.docx) | `python-docx` | 512 tokens | 64 tokens | On re-upload | Control evidence |
| Excel (.xlsx) | `openpyxl` + `pandas` | Row-based | N/A | On re-upload | Control testing data |

**Retrieval strategy:**

| Strategy | Technology | When used | Tenant isolation |
|---|---|---|---|
| Semantic | FAISS k-NN (Plan A) / pgvector `<->` operator (Plan B) | Primary retrieval | Pre-filter by `tenant_id` + `assessment_id` before FAISS; WHERE clause in pgvector |
| Keyword | Postgres FTS (`to_tsquery`) | Fallback / hybrid | WHERE `tenant_id = %s` |
| Hybrid | RRF (Reciprocal Rank Fusion) | Default when both indexes available | Both filtered |
| Temporal | `chunk_created_at` filter | When recency matters | Same |

**Context-window budget allocation** (from `backend/app/chatbot/`):
- Total budget: model context window − max_output_tokens
- System prompt: fixed allocation
- Retrieved chunks: up to 60% of remaining budget (tiktoken count)
- Conversation history: up to 30% of remaining budget (oldest messages dropped first)
- User query: remainder

---

### 3.6 Enterprise integrations

**Azure Blob / S3** (`backend/app/infra/blob_storage.py`):
- Upload: stream directly to blob; never write to container filesystem
- Download: pre-signed URL or streamed via backend (Plan A: S3-compatible; Plan B: Azure Blob SAS)
- AV scanning: ClamAV (Plan A) or Azure Defender for Storage (Plan B) before processing
- BYOK: customer-managed keys via Key Vault (Plan B only)

**Better Auth (`auth-service/`):**
- Express 5 + Better Auth + Helmet + node-postgres
- Mounted at `/api/auth/*` via nginx
- Session: httpOnly, secure, sameSite=strict, 8h absolute timeout, 60 s cache in backend
- Admin plugin: `delivery_lead` role management
- OIDC pluggability: `AUTH_PROVIDER=oidc` → OIDC middleware (`deploy/on-premise/auth/oidc_middleware.py`)

**OpenAI / LiteLLM (`backend/app/llm_client.py`):**
- Default: OpenAI SDK direct (no LiteLLM overhead for common path)
- LiteLLM lazy-loaded for: Azure OpenAI, self-hosted models, other providers
- Retry: up to 3× with exponential backoff (1 s, 2 s, 4 s) on transient failures
- Input sanitization: `bleach` strips injection patterns before LLM call
- Logging: service name, model, latency, token usage per call → `app.audit_events`

**Redis (`backend/app/infra/`):**
- Session store: pluggable factory (`RedisBackend` → `PostgresBackend` → `SQLiteBackend`)
- SSE fan-out: Redis pub/sub; each worker subscribes to `sse:{session_id}` channel
- Cache: SHA-256 keyed auth sessions (60 s TTL, 2048 entries LRU)
- Password-protected; TLS in Plan B

**Plan B optional integrations:**
- **Azure Service Bus:** queue long-running LLM batch jobs; dead-letter queue for failed assessments
- **Azure AI Search:** hybrid retrieval replacing FAISS (semantic + keyword in one service)

**Integration health monitoring:**
All integrations emit health metrics via `GET /api/health` and `llm_health` router:

| Integration | Health check | Fallback behaviour |
|---|---|---|
| Auth Service | `GET /health` every 10 s | Circuit breaker: serve from cache for 30 s |
| LLM | `llm_health` router | Return 503 with `{"code": "LLM_UNAVAILABLE"}` |
| Redis | `redis-cli PING` | Fall back to `PostgresBackend` session store |
| PostgreSQL | `pg_isready` | Return 503 |
| Blob Storage | HEAD object | Return 503 on upload; read from cache if available |

## Output requirements

- Output file: `docs/output/03_technical_specifications.md`
- Start with `## 3. Technical specifications`
- End with `---`
- Every file path, table name, module name in `inline code`
