# Section prompt 06 — Appendix 1: Architecture decision records (ADRs)
# Part 7 of 8 | Output file: docs/output/06_appendix_adrs.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 7 of 8** of the RCA Architecture Document — **Section 6: Appendix 1 — Architecture decision records**.

ADRs are permanent records. They must be honest about the trade-offs, not just a rationale for the chosen option. A reader 2 years from now must understand why the decision was made, what was rejected, and what would trigger a revisit.

## Repos to read

- `project_setup_prompt.md` — all architecture decisions
- `backend/app/middleware/auth.py` — circuit-breaker pattern
- `deploy/on-premise/helm/` — Helm chart structure
- `infrastructure/` (IaC repo) — Terraform modules, `enabled_modules`
- `backend/app/llm_client.py` — LLM provider abstraction

## What to produce

Output heading: `## 6. Appendix 1 — Architecture decision records (ADRs)`

For each ADR use this exact template:

```
### ADR-NNN — Title

**Status:** Accepted | Superseded by ADR-XXX | Proposed
**Date:** <ISO date>

#### Context
<2–3 sentences on what situation or requirement drove this decision>

#### Options considered
| Option | Pros | Cons |
|---|---|---|
| ... | | |

#### Decision
<Chosen option, 1–2 sentences>

#### Rationale
<Why this option over the others — be honest about trade-offs>

#### Consequences
**Positive:** ...
**Negative / risks:** ...
**Revisit trigger:** <what would cause this decision to be reversed>
```

---

Produce all 10 ADRs:

**ADR-001 — RAG-first, conservative-autonomy AI over fully agentic design**
- Context: the platform needs AI to assist with risk assessment. Options range from fully autonomous agents (no human in the loop) to fully manual (AI disabled). The key constraint: every AI output must be defensible to regulators (SR 11-7).
- Options: (1) Fully agentic — LLM autonomously saves assessment records, (2) RAG-first with HITL — LLM proposes, analyst approves, (3) Deterministic rules only — no LLM
- Decision: RAG-first with HITL
- Revisit trigger: when regulator guidance explicitly allows autonomous AI writing to audit records without human sign-off

**ADR-002 — Multi-tenancy via `app` schema + RLS + `tenant_id` column**
- Context: platform must serve multiple client organisations on a single deployment, with strict data isolation.
- Options: (1) Separate database per tenant, (2) Separate schema per tenant, (3) Single schema with `tenant_id` + RLS
- Decision: single `app` schema with `tenant_id` column on all tables + RLS via `set_config('app.current_tenant_id', tenant_id)`
- Cite: `db_provisioning/db/init/001_app_schema.sql`
- Revisit trigger: tenant count > 500 or tenant data size > 1 TB

**ADR-003 — PostgreSQL + pgvector as unified OLTP + vector store; FAISS in-process (Plan A)**
- Context: need vector similarity search for RAG retrieval. Options include dedicated vector DBs (Pinecone, Weaviate, Qdrant) vs. extending PostgreSQL.
- Options: (1) Pinecone (managed, hosted), (2) Qdrant (self-hosted), (3) pgvector extension on existing PostgreSQL, (4) FAISS in-process + pgvector as backup
- Decision: FAISS in-process (Plan A) for sub-millisecond latency + pgvector on PostgreSQL (both plans) for persistence
- Revisit trigger: corpus exceeds single-pod FAISS memory; or retrieval latency SLA cannot be met

**ADR-004 — Frontend stack: React + TypeScript + Vite + TanStack Router/Query + Zustand**
- Context: need a modern, type-safe frontend for a multi-step wizard with real-time AI progress.
- Options: (1) Next.js (SSR), (2) Remix, (3) React SPA (Vite), (4) Vue / Svelte
- Decision: React SPA (Vite 7) + TanStack Router + TanStack Query + Zustand
- Cite: `frontend/` directory structure
- Revisit trigger: SSR/SEO requirements emerge (unlikely for an internal tool)

**ADR-005 — Human-in-the-loop default for all persisted AI outputs**
- Context: SR 11-7 and internal policy require that AI model outputs used in risk assessments be reviewed and approved by a named human before they are included in the official assessment record.
- Options: (1) AI auto-saves, analyst can override, (2) AI proposes, analyst must explicitly approve, (3) AI disabled; fully manual
- Decision: AI proposes; analyst must explicitly approve every field before it persists to `assessment_*`; enforced by WIP state machine (`draft → reviewed → approved → saved`) and `app.approval_requests`
- Cite: `app.wip_sessions`, `app.approval_requests`
- Revisit trigger: regulator explicitly approves autonomous AI writing to audit records

**ADR-006 — Hybrid communication: REST (sync), SSE (real-time), Redis pub/sub (async)**
- Context: AI generation is slow (5–30 s per step). The UI must show progress in real time. Options include WebSockets, long polling, SSE.
- Options: (1) WebSockets (bidirectional), (2) Long polling, (3) SSE (unidirectional server push), (4) GraphQL subscriptions
- Decision: SSE (`backend/app/routes/sse_events.py`) + Redis pub/sub for multi-worker fan-out; REST for all synchronous operations; Azure Service Bus (Plan B) for long-running async jobs
- Revisit trigger: bidirectional real-time collaboration features required

**ADR-007 — Separate Better Auth Express service; backend validates via HTTP + cache + circuit breaker**
- Context: auth could be handled inline in FastAPI or delegated to a dedicated service.
- Options: (1) FastAPI middleware with JWT, (2) FastAPI with Better Auth Python bindings, (3) Separate Express Better Auth service, (4) Managed identity provider (Auth0, Okta)
- Decision: separate Express service (`auth-service/`); backend calls it via HTTP with SHA-256 cookie cache (60 s TTL, 2048 entries) and circuit breaker in `backend/app/middleware/auth.py`
- Revisit trigger: latency from HTTP auth call exceeds 50 ms p95 after caching

**ADR-008 — Terraform reusable modules with `enabled_modules` feature-flag map per environment**
- Context: IaC repo must support multiple environments (dev, staging, prod) and optional module enablement (e.g., Databricks is optional, vCluster is optional).
- Options: (1) Separate Terraform root per environment, (2) Single root with `tfvars` per env, (3) Reusable modules + `enabled_modules` map
- Decision: reusable modules + `enabled_modules = { databricks = false, vcluster = true, ... }` in `infrastructure/envs/`
- Revisit trigger: module coupling becomes unmanageable; switch to Terragrunt

**ADR-009 — BYOK customer-managed keys for PostgreSQL / Storage / Service Bus via dedicated Key Vault (Plan B)**
- Context: enterprise clients require that encryption keys be under their control (GDPR Art. 32; SOC 2 CC6.7).
- Options: (1) Microsoft-managed keys (default), (2) Customer-managed keys (CMK) via Key Vault, (3) Client-side encryption before storage
- Decision: CMK via dedicated Azure Key Vault; applied to PostgreSQL Flexible, Blob Storage, Service Bus
- Revisit trigger: client requires HSM-level key custody (move to Dedicated HSM)

**ADR-010 — Helm chart as single source of truth for on-prem / Plan A deployments**
- Context: on-prem deployments need a reproducible, version-controlled way to configure all services.
- Options: (1) Docker Compose only, (2) Raw Kubernetes manifests, (3) Helm chart, (4) Kustomize
- Decision: Helm chart in `deploy/on-premise/helm/` as single source of truth; values files per environment; GitOps repo references image tags
- Revisit trigger: chart complexity exceeds Helm's templating; consider Kustomize or CDK8s

---

After all 10 ADRs, produce:

### Plan A vs. Plan B detailed comparison & migration paths

**Full comparison table** (expand on §1.2 — add: team skill required, data migration complexity, rollback feasibility, cost model, SLA guarantees):

| Dimension | Plan A | Plan B |
|---|---|---|
| (all dimensions from §1.2 plus the above) | | |

**Migration paths:**

**A → B (on-prem to Azure):**
1. Deploy IaC (`infrastructure/`) to provision Azure resources
2. Migrate PostgreSQL data: `pg_dump` → Azure Database Migration Service
3. Re-index embeddings to pgvector (FAISS index not transferable)
4. Switch `BLOB_PROVIDER` env var; migrate documents to Azure Blob
5. Switch `LLM_PROVIDER` to Azure OpenAI; test prompt compatibility
6. Switch observability to Azure Monitor / Log Analytics
7. Update GitOps `values.yaml` to point to AKS
8. Validate with a parallel run; cut over DNS

Effort estimate: `target` — 4–8 weeks for a team of 3 with Azure experience.

**B → A (Azure to on-prem):**
1. Provision self-hosted Kubernetes cluster + PostgreSQL + Redis
2. `pg_dump` from Azure PostgreSQL Flexible; restore to self-hosted
3. Rebuild FAISS indexes from pgvector embeddings (`backend/app/core/`)
4. Switch `BLOB_PROVIDER` to S3-compatible; migrate blobs
5. Switch `LLM_PROVIDER` to OpenAI direct or LiteLLM self-hosted
6. Deploy Prometheus + Grafana stack
7. Update GitOps repo; cut over DNS

Effort estimate: `target` — 3–6 weeks; BYOK key migration is the highest-risk step.

---

### Technology selection justification tables

**LLM provider:**

| Provider | Latency | Cost | Privacy | Lock-in | Plan |
|---|---|---|---|---|---|
| OpenAI direct | Low | Medium | Data sent to OpenAI | Low (via LiteLLM) | A |
| Azure OpenAI | Low | Medium | Data in Azure tenant | Medium | B |
| Self-hosted (LiteLLM + vLLM) | Medium | High (GPU) | Fully on-prem | None | A (optional) |
| Anthropic Claude | Low | Medium | Data sent to Anthropic | Low | A (optional) |

**Vector DB / index:**

| Technology | Query latency | Persistence | Multi-tenant | Ops complexity | Plan |
|---|---|---|---|---|---|
| FAISS (in-process) | Sub-ms | Rebuild on restart | Pre-filter | None | A |
| pgvector | 5–20 ms | Persistent | WHERE clause | Low (PG extension) | Both |
| Qdrant | 2–10 ms | Persistent | Native namespaces | Medium (extra service) | Not chosen |
| Pinecone | 10–50 ms | Persistent | Native namespaces | Low (managed) | Not chosen |
| Azure AI Search | 10–30 ms | Persistent | Native indexes | Low (managed) | B (optional) |

**Orchestration framework:**

| Framework | Capability | Overhead | Debuggability | Chosen? |
|---|---|---|---|---|
| In-house (`llm_client.py`) | Retry, fallback, multi-provider | Minimal | Full control | Yes |
| LangChain | Full agent, tools, chains | Heavy | Complex stack traces | No |
| LlamaIndex | RAG-focused | Medium | Moderate | No |
| Semantic Kernel | .NET/Python, Microsoft ecosystem | Medium | Moderate | No |

---

### Risk register (minimum 10 entries)

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| RK-001 | LLM quality regression — model update changes output format or quality | Medium | High | Golden-set eval on every model change; `respond_json` fallback; `_DEFAULT_MODELS` pinned | Tech Lead |
| RK-002 | Cost overrun — LLM token usage exceeds budget | Medium | Medium | Token budget enforcement; model tiering; Redis prompt cache; monthly cost alerts | Delivery Lead |
| RK-003 | Prompt injection — malicious content in uploaded documents | Low | High | `bleach` input sanitization; DOMPurify output sanitization; HITL gate | Security Lead |
| RK-004 | Tenant data leakage — RLS misconfiguration | Low | Critical | RLS unit tests; integration tests with multi-tenant fixtures; penetration test | Tech Lead |
| RK-005 | Integration failure — auth service unreachable | Medium | High | Circuit breaker; in-memory cache (60 s TTL); fallback to cached session | Tech Lead |
| RK-006 | Performance degradation — FAISS index memory exhaustion | Low | High | Pod memory limits + HPA; pgvector fallback; index rebuild SLA < 30 s | Tech Lead |
| RK-007 | Regulatory non-compliance — AI decision not auditable | Low | Critical | `audit_events` captures prompt + chunks + model + user; 7-year retention | Compliance Rep |
| RK-008 | Key-personnel dependency — single engineer knows RAG pipeline | Medium | High | Architecture documentation (this document); pair programming policy; runbook | Delivery Lead |
| RK-009 | Vendor outage — OpenAI / Azure OpenAI unavailable | Medium | High | LiteLLM multi-provider fallback; circuit breaker; degraded-mode UI (disable AI features) | Tech Lead |
| RK-010 | User-adoption resistance — analysts distrust AI drafts | Medium | High | Transparent rationale display; override logging; monthly recall sampling shared with users | Delivery Lead |
| RK-011 | Taxonomy drift — practice changes taxonomy mid-cycle | Medium | Medium | `schema_change_log`; version lock during active assessments | Risk Practice Lead |
| RK-012 | GDPR erasure vs. audit retention conflict | Low | High | Legal-hold flag; GDPR erasure via anonymisation (not deletion) for SOX-retained records | Compliance Rep |

---

### FAQ / anticipated questions

**Technical:**
- *Why not LangChain / LlamaIndex?* The platform's AI use cases are narrow and well-defined. A full agent framework adds dependency weight and non-determinism that would complicate regulatory audit of AI decisions. See ADR-001.
- *Why FAISS in Plan A instead of pgvector only?* FAISS provides sub-millisecond in-process retrieval, eliminating the network round-trip to PostgreSQL. pgvector is used as the persistent backup. See ADR-003.
- *Why a separate auth service instead of FastAPI-native JWT?* Server-side session revocation, pluggable OIDC, and no token storage in localStorage. See ADR-007.

**Business:**
- *What happens if the LLM goes down?* The platform degrades gracefully — AI generation features return a 503 with a clear user message; manual entry still works. Circuit breaker in `backend/app/middleware/auth.py` pattern applied to LLM client.
- *Can this be deployed on-prem with no internet?* Yes. Plan A with a self-hosted LiteLLM + local model requires no outbound internet. Embeddings are computed locally via SentenceTransformer.
- *What does "human-in-the-loop" mean in practice?* Every AI-proposed value requires an explicit analyst click to accept, reject, or edit before it is saved to the database. This is enforced in code via the WIP state machine, not policy.

**Compliance:**
- *Does the platform meet SR 11-7?* The architecture addresses the key SR 11-7 requirements: model documentation (logged per call), validation (golden-set eval), ongoing monitoring (monthly sampling), effective challenge (analyst override with logging). Full compliance requires a model risk management programme on top of the platform.
- *Can we get a SOC 2 Type II report?* The architecture is designed to support SOC 2 evidence collection (`audit_events`, `approval_requests`, access logs, encryption). A formal audit engagement is required to obtain the report.

---

### What this is *not* — honesty list

- **Not an autonomous agent:** no AI output is written to the assessment record without a named human approving it
- **Not a replacement for control testing:** it proposes effectiveness ratings; the auditor tests and confirms
- **Not a taxonomy author:** the taxonomy is configuration-driven and curated by the practice; the tool applies it consistently, it does not define it
- **Not a public-API product in v1:** external integration patterns (bulk export, public API) are a documented gap for a later phase
- **Not trained on client data:** models are accessed via API; prompts and chunks are logged per tenant for audit, not reused for training
- **Not a substitute for professional judgment:** the tool anchors judgment to evidence — it does not replace it

## Output requirements

- Output file: `docs/output/06_appendix_adrs.md`
- Start with `## 6. Appendix 1 — Architecture decision records (ADRs)`
- End with `---`
- Use the exact ADR template for every ADR
