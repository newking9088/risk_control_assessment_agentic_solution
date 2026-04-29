# Section prompt 04 — Non-functional requirements
# Part 5 of 8 | Output file: docs/output/04_nonfunctional_requirements.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 5 of 8** of the RCA Architecture Document — **Section 4: Non-functional requirements**.

This section is the contract between the architecture and operations/compliance teams. Every claim must be measurable, cite a compliance framework, and be grounded in an actual architectural control in the repo.

## Repos to read

- `backend/app/middleware/` — auth, csrf, rate_limit, security_headers, session_flush
- `backend/app/infra/` — DB pool, Redis, blob storage
- `backend/app/llm_client.py` — logging, retry, sanitization
- `deploy/on-premise/helm/` — HPA, resource limits
- `infrastructure/` (IaC) — Azure Monitor, Key Vault, BYOK

## What to produce

Output heading: `## 4. Non-functional requirements`

---

### 4.1 Security & compliance

**Security requirements matrix:**

| Requirement | Category | Implementation | Compliance ref |
|---|---|---|---|
| TLS on all transport | Transport | nginx TLS termination; HSTS `max-age=31536000; includeSubDomains; preload` | SOC 2 CC6.7; GDPR Art. 32 |
| Session-based auth | Auth | Better Auth; httpOnly, secure, sameSite=strict | SOC 2 CC6.2 |
| Account lockout | Auth | 5 failures → 15 min lock; `auth:failed_login` audit event | SOC 2 CC6.1 |
| MFA for privileged roles | Auth | TOTP required for `delivery_lead`; OIDC MFA delegation | SOC 2 CC6.1 |
| RBAC on all endpoints | Authz | `require_minimum_role()` dependency on every router | SOC 2 CC6.3 |
| Rate limiting | API | `slowapi` on LLM generation endpoints | FFIEC |
| CSRF protection | API | Double-submit cookie (`backend/app/middleware/csrf.py`) | OWASP Top 10 A01 |
| Input validation | API | Pydantic models on all request schemas | OWASP Top 10 A03 |
| File upload security | API | MIME allowlist + magic-byte check + 50 MB limit + AV scan | SOC 2 CC6.6 |
| No stack traces in prod | API | `FastAPI(debug=False)`; RFC 7807 error format | SOC 2 CC7.3 |
| Prompt injection prevention | AI | `bleach` input sanitization before LLM call | SR 11-7 §III |
| XSS prevention | Frontend | `DOMPurify` on all AI-generated HTML | OWASP Top 10 A03 |
| Multi-tenant data isolation | Data | RLS via `set_config('app.current_tenant_id', ...)` | SOC 2 CC6.3; GDPR Art. 32 |
| Secrets in vault | Secrets | Env vars (Plan A) / Azure Key Vault (Plan B); never in code | SOC 2 CC6.1 |
| BYOK | Data (Plan B) | Azure Key Vault CMK on PostgreSQL Flexible, Blob, Service Bus | GDPR Art. 32; SOC 2 CC6.7 |
| Container hardening | Infra | Non-root user; multi-stage builds; OCI labels; Cosign signing | SOC 2 CC6.6 |
| Dependency scanning | CI/CD | `pip-audit`, `npm audit`, Trivy on every PR + weekly | SOC 2 CC7.1 |
| Secret scanning | CI/CD | `gitleaks` on every push + PR | SOC 2 CC6.1 |
| SAST | CI/CD | Bandit (Python) + Semgrep (Python + TS) | SOC 2 CC7.1 |
| SBOM | Releases | `syft` generates CycloneDX SBOM on every tagged release | SOC 2 CC7.1 |

**Compliance mapping table:**

| Framework | Relevant requirement | Architectural control |
|---|---|---|
| SOX ICFR | Financial reporting controls must be documented and tested | `app.audit_events`; `app.approval_requests`; 7-year retention |
| SOC 2 Type II CC6.1 | Logical access managed | Better Auth RBAC; account lockout; MFA for delivery_lead |
| SOC 2 Type II CC6.3 | Role-based access on data | `require_minimum_role()`; RLS policies |
| SOC 2 Type II CC6.7 | Data in transit encrypted | TLS everywhere; HSTS; BYOK (Plan B) |
| SOC 2 Type II CC7.2 | System monitoring | `audit_events`; Prometheus / Azure Monitor alerts |
| SOC 2 Type II CC7.3 | Security events responded to | Alert thresholds; incident runbook (`docs/RUNBOOK.md`) |
| GDPR Art. 5 | Data minimisation, purpose limitation | PII classification; no PII in logs; chunked text only |
| GDPR Art. 17 | Right to erasure | Soft-delete + legal-hold flag on `assessments`; cascade on chunks |
| GDPR Art. 32 | Technical security measures | TLS; RLS; BYOK; access logs |
| SR 11-7 (Fed Reserve / OCC) | Model risk management | Prompt + model + tokens + user logged per AI decision; HITL |
| FFIEC | Fraud risk management | Taxonomy lock during assessment; approval workflow |
| IIA IPPF Std 2010 | Risk-based audit planning | Consistent taxonomy; cross-AU comparability |
| IIA IPPF Std 2120 | Risk management assurance | Residual risk deterministic; human approval required |
| COSO ERM 2017 Principle 12 | Risk response | Control-gap surfacing in assessment summary |

**Data privacy controls:**

| Control | Implementation | Scope |
|---|---|---|
| PII classification | `CONFIDENTIAL` tag on all assessment data; `INTERNAL` on telemetry | All `app.*` tables |
| PII minimisation | Only extracted text chunks stored; raw documents in blob (not DB) | `app.assessment_documents`, `app.assessment_chunks` |
| Retention policy | 7-year retention for SOX; 90-day auto-purge for WIP / chat | Per-entity retention in §3.3 |
| Legal-hold | `legal_hold` flag on `app.assessments`; blocks cascade delete | `app.assessments` |
| Subject access | Admin API to export all data for a tenant / user | `delivery_lead` only |
| Right to erasure | Soft-delete + anonymisation; legal-hold exception | GDPR Art. 17 |

---

### 4.2 AI guardrails & policy enforcement

**AI safety framework:**

| Layer | Control | Implementation |
|---|---|---|
| Input | Prompt injection prevention | `bleach` sanitizes user input before LLM call |
| Input | PII in prompt | Analyst-uploaded content is chunked text; no direct PII fields in prompts |
| Processing | Token budget enforcement | tiktoken check before LLM call; prompt compression if over budget |
| Processing | Retry + fallback | 3× retry with exponential backoff; `respond_json` multi-strategy parse |
| Output | XSS prevention | `DOMPurify` on frontend before rendering AI-generated HTML |
| Output | Structured output validation | `output_schema` validation in `respond_json` |
| Action | HITL gate | WIP state machine; `approval_requests`; nothing persisted to `assessment_*` without human approval |
| Action | Audit log | Every LLM call logged: prompt, chunks, model, confidence, tokens, user, timestamp |

**Human-in-the-loop controls table (complete):**

| AI action | Default | Who can approve | Persistence rule | Evidence retained |
|---|---|---|---|---|
| Risk applicability | Proposed, not persisted | `analyst`, `delivery_lead` | Analyst must confirm before saving | Prompt, retrieved chunks, model, confidence, user, timestamp |
| Inherent L/I rating | Proposed, not persisted | Same | Analyst confirms or overrides (override logged) | Above + list of unmapped gap risks |
| Control mapping | Proposed, not persisted | Same | Analyst confirms | Above + control-gap flags |
| Control effectiveness | Proposed, not persisted | Same | Analyst confirms + evidence excerpts | Above + evidence excerpt references |
| Residual risk | Computed deterministically from approved inputs | N/A (not LLM) | Automatic on approval of inputs | Input values, matrix version |
| Assessment summary | Draft | Analyst edits and signs off | Analyst sign-off required | Versioned draft history in `wip_sessions` |
| Chat assistant answer | Ephemeral | Analyst can promote to notes | Never auto-persisted to assessment record | SSE trace in `chat_telemetry` |
| QA answers | Proposed draft | Analyst | Analyst confirms | Same as risk applicability |

**Explainability log — what is stored per AI decision:**

| Field | Table | Retention |
|---|---|---|
| `prompt` (full text) | `app.audit_events` | 7 years |
| `retrieved_chunks` (IDs + scores) | `app.audit_events` | 7 years |
| `model` name + version | `app.audit_events` | 7 years |
| `confidence` / structured output | `app.audit_events` | 7 years |
| `tokens_in`, `tokens_out` | `app.chat_telemetry`, `app.audit_events` | 1–7 years |
| `user_id` | `app.audit_events` | 7 years |
| `timestamp` (ISO, ms precision) | `app.audit_events` | 7 years |
| Override delta (when analyst changes AI output) | `app.audit_events` | 7 years |

---

### 4.3 Observability & operations

**Stack per plan:**

| Component | Plan A | Plan B |
|---|---|---|
| Metrics | Prometheus (`prometheus-fastapi-instrumentator`) | Azure Monitor |
| Dashboards | Grafana | Azure Monitor Workbooks / App Insights |
| Logs | Loki + structured JSON (`python-json-logger`) | Log Analytics + structured JSON |
| Traces | Tempo | App Insights distributed tracing |
| Alerts | Grafana Alertmanager | Azure Monitor Alert rules |
| LLM-specific | Custom Prometheus metrics in `llm_client.py` | Same + Azure OpenAI token metrics |

**Key metrics table with alert thresholds:**

| Metric | Target | Alert threshold | Dashboard |
|---|---|---|---|
| API p95 latency | < 500 ms | > 800 ms | API dashboard |
| LLM call latency (p95) | < 10 s | > 30 s | LLM dashboard |
| Token cost per assessment | `target` | > 2× baseline | Cost dashboard |
| Cache hit rate (auth + Redis) | > 90% | < 70% | Cache dashboard |
| SSE connection count | — | > 500 concurrent | SSE dashboard |
| Assessment approval rate (1st pass) | ≥ 70% `target` | < 50% | Risk dashboard |
| Retrieval recall (golden set) | ≥ 80% `target` | < 60% | RAG dashboard |
| Error rate (5xx) | < 0.1% | > 1% | API dashboard |
| Auth circuit breaker trips | 0 | > 0 per hour | Auth dashboard |

**LLM-specific monitoring** (logged per call in `backend/app/llm_client.py`):

| Metric | What it detects |
|---|---|
| `tokens_in` / `tokens_out` per call | Prompt size drift; cost anomalies |
| Model latency p50/p95/p99 | LLM API degradation |
| Cache hit rate (Redis prompt cache) | Cache effectiveness |
| `respond_json` fallback rate | Output format regression |
| Error rate by model | Provider-specific issues |
| Monthly human sampling evaluation score | AI quality regression |

**Logging standards:**
All logs structured JSON via `python-json-logger`. Required fields:
`{"timestamp": "ISO", "level": "INFO|WARN|ERROR", "service": "backend|auth|frontend", "trace_id": "...", "tenant_id": "...", "user_id": "...", "message": "..."}`
**No PII in logs.** Redact before logging if source data may contain names, emails, or account numbers.

---

### 4.4 Scalability & reliability

**Capacity targets table:**

| Metric | MVP target | Growth target | Notes |
|---|---|---|---|
| Concurrent users | 50 | 500 | Per tenant |
| Assessments / month | 100 | 1,000 | Cross-tenant total |
| Documents / day | 500 | 5,000 | Upload + processing |
| LLM requests / hour | 200 | 2,000 | Peak generation load |
| SSE connections | 100 | 1,000 | Simultaneous streaming |
| pgvector / FAISS queries / s | 50 | 500 | Retrieval throughput |

**Reliability targets:**

| Component | Availability | RTO | RPO | MTTR |
|---|---|---|---|---|
| Backend API | 99.9% | 5 min | 1 min (stateless) | 10 min |
| Auth Service | 99.9% | 5 min | 1 min (stateless) | 10 min |
| PostgreSQL | 99.95% | 15 min | 5 min | 30 min |
| Redis | 99.9% | 5 min | 0 (ephemeral) | 10 min |
| Blob Storage | 99.99% | — | — | — |
| LLM API (external) | SLA per provider | Circuit breaker opens after N failures | N/A | N/A |

**HA architecture per component:**

| Component | Plan A HA | Plan B HA |
|---|---|---|
| Backend API | Kubernetes HPA (min 2 replicas) | AKS HPA; Azure Load Balancer |
| Auth Service | Kubernetes HPA (min 2 replicas) | AKS HPA |
| PostgreSQL | Primary + read replica (self-hosted) | Azure PostgreSQL Flexible HA (zone-redundant) |
| Redis | Redis Sentinel / Cluster | Azure Cache for Redis Premium (geo-replica) |
| FAISS index | Rebuild on pod start (< 30 s for typical corpus) | N/A (pgvector used) |
| Blob Storage | Replication per cloud provider | Azure LRS / ZRS |

**DR tiers and strategy:**

| Tier | RTO | RPO | Strategy |
|---|---|---|---|
| Tier 1 (assessment data) | 15 min | 5 min | PostgreSQL WAL streaming; point-in-time restore |
| Tier 2 (documents) | 1 hour | 1 hour | Blob storage geo-replication |
| Tier 3 (audit events) | 4 hours | 15 min | PostgreSQL backup + audit event export |
| Tier 4 (config / taxonomy) | 4 hours | 24 hours | GitOps repo as source of truth |

---

### 4.5 Cost optimization

**LLM cost-management strategies:**

| Strategy | Implementation | Expected saving |
|---|---|---|
| Prompt caching | Redis cache keyed on (model + truncated prompt hash); 60 s TTL | 20–40% on repeated applicability runs |
| Model tiering | `_DEFAULT_MODELS` routes summarization to cheaper model; reasoning to GPT-4 class | 30–50% vs. always using largest model |
| Prompt compression | Token budget enforcement in `llm_client.py`; trim context window | 10–20% reduction in tokens_in |
| Early termination | `max_tokens` set per use case; no open-ended generation | Prevents runaway costs |
| Batching (Plan B) | Azure Service Bus batches embedding generation offline | Reduces embedding API calls |

**Infrastructure optimization:**

| Lever | Plan A | Plan B |
|---|---|---|
| Pod right-sizing | Resource requests/limits in Helm values | AKS node pool right-sizing |
| Autoscaling | HPA on CPU/memory; KEDA on Redis queue length | AKS KEDA + Azure Monitor-based scaling |
| Spot / preemptible nodes | Kubernetes spot node pool for worker pods | Azure Spot VM node pools |
| Reserved capacity | N/A | Azure Reserved Instances (1–3 year) for stable workloads |
| Storage tiering | N/A | Azure Blob lifecycle policy: hot → cool → archive |

**Cost allocation / chargeback model:**
All costs attributed per `tenant_id`:
- LLM token costs: logged in `app.chat_telemetry` + `app.audit_events` (`tokens_in`, `tokens_out`, model)
- Storage costs: `assessment_documents.blob_size_bytes` per tenant
- Compute costs: Kubernetes namespace resource quotas per tenant (Plan A); Azure cost tags per tenant (Plan B)
- Monthly chargeback report: exportable from admin console (delivery_lead only)

## Output requirements

- Output file: `docs/output/04_nonfunctional_requirements.md`
- Start with `## 4. Non-functional requirements`
- End with `---`
- Every forward-looking metric marked `target`
- All tables use GitHub-flavored markdown
