# Section prompt 01 — Executive summary
# Part 2 of 8 | Output file: docs/output/01_executive_summary.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 2 of 8** of the RCA Architecture Document — **Section 1: Executive summary**.

This section must stand alone as a C-suite / steering-committee read. A reader who reads only this section must understand what the platform does, why both deployment plans exist, and what the key architectural bets are.

## Repos to read

- `project_setup_prompt.md` — 7-step workflow, full stack, all architecture decisions
- `BUSINESS_VALUE_PROP_PROMPT.md` — business context, KPIs, stakeholder map
- `backend/app/services/` — to confirm AI capabilities are real, not fabricated
- `db_provisioning/db/init/` — to confirm table names
- `backend/app/routers/` — to confirm route names

## What to produce

Output heading: `## 1. Executive summary`

---

### 1.1 Solution overview

**Paragraph 1 — What the platform does:**
Describe the RCA platform in 3–4 sentences: SMEs (1st-line risk owners, 2nd-line risk leads, internal auditors) run a 7-step risk & control assessment (Process → Taxonomy → Identify Risks → Inherent Risk → Controls → Residual Risk → Summary). LLMs generate applicability ratings, inherent risk ratings, control effectiveness mappings, and residual risk scores over uploaded documents. Analysts review, edit, and approve every AI output. Everything is audited with full provenance (prompt, retrieved chunks, model, user, timestamp).

**Problem statement table** — fill every cell:

| Challenge | Business impact |
|---|---|
| Manual, inconsistent risk assessments across auditors and AUs | |
| Inconsistent taxonomy application — risk names and scores drift between engagements | |
| Weak audit evidence: narrative-only, no traceable rationale for ratings | |
| Time spent on low-value data entry instead of judgment work (2–3 months per RCSA cycle) | |
| Regulator-grade explainability gaps (SR 11-7, SOC 2 CC7.2) | |
| Rework between 1st/2nd-line reviews due to incomplete first submissions | |
| Control-gap blind spots: unmapped or ineffective controls not surfaced until review | |

**Target outcomes table** — label every forward-looking number `target`:

| Dimension | Target KPI | Measurement |
|---|---|---|
| Analyst hours per AU | ≥ 50% reduction `target` | Time-on-task via `audit_events` timestamps |
| Taxonomy coverage with anchored rationale | ≥ 80% `target` | Monthly taxonomy-alignment sampling |
| Residual-rating approval rate (1st pass) | ≥ 70% without rework `target` | `approval_requests` outcomes |
| Audit-trail coverage | 100% of AI decisions logged | `audit_events` completeness check |
| Time from assessment close to sign-off | Hours, not days `target` | SLA metric in `approval_requests` |
| Cross-AU comparability | High — same taxonomy, same scale | Residual-rating variance per risk across AUs |

---

### 1.2 Plan A vs. Plan B high-level comparison

Fill every cell — do not leave blanks:

| Dimension | Plan A — Cloud-Agnostic / On-Prem | Plan B — Azure-Native (Enterprise) |
|---|---|---|
| Core philosophy | | |
| LLM provider | OpenAI SDK direct / LiteLLM | Azure OpenAI (Cognitive Services) |
| Embedding model | SentenceTransformer `paraphrase-MiniLM-L6-v2` + FAISS | SentenceTransformer + pgvector / Azure AI Search |
| Vector store | FAISS (in-process) + `app.assessment_chunks` (pgvector backup) | pgvector on Azure PostgreSQL Flexible |
| Object storage | S3-compatible / Azure Blob | Azure Blob + BYOK (Key Vault) |
| Auth | Better Auth (self-hosted) | Better Auth + optional Azure AD OIDC |
| Container platform | Kubernetes + Helm (`deploy/on-premise/helm/`) | AKS / vCluster |
| Observability | Prometheus / Grafana / Loki / Tempo | Azure Monitor / App Insights / Log Analytics |
| Secrets management | Env vars / HashiCorp Vault | Azure Key Vault |
| Time-to-production | | |
| Estimated TCO | | |
| Vendor lock-in | Low | Medium (Azure services) |
| Compliance posture | Cloud-agnostic; customer controls infra | Azure compliance certifications available |

Include a C4 Context diagram (Mermaid) showing the system boundary, users, and both deployment targets at a high level.

---

### 1.3 Key design decisions summary

Produce a table: `Decision area` × `Choice` × `Rationale`. Must include all of the following — cite the exact ADR number from Section 6 for each:

| Decision area | Choice | Rationale | ADR |
|---|---|---|---|
| AI autonomy model | RAG-first, human-reviewed proposals | | ADR-001 |
| Vector store (Plan A) | FAISS in-process | Sub-millisecond retrieval; no extra infra | ADR-003 |
| Vector store (Plan B) | pgvector on Azure PostgreSQL Flexible | Persistent, multi-tenant, no separate service | ADR-003 |
| Relational + vector DB | PostgreSQL + pgvector unified | Single connection string, RLS works on both | ADR-003 |
| Multi-tenancy isolation | Schema-per-tenant + RLS via `set_config` | DB-layer enforcement; single codebase | ADR-002 |
| Real-time updates | REST + SSE; Redis pub/sub fan-out | SSE simpler than WebSockets; Redis handles multi-worker | ADR-006 |
| Frontend state | TanStack Router/Query + Zustand | Server state vs. UI state separation | ADR-004 |
| Auth architecture | Separate Express Better Auth service | Session revocability; no JWT in localStorage | ADR-007 |
| AI persistence gate | WIP state machine + `approval_requests` | Enforced in code, not policy | ADR-005 |
| Taxonomy | Configuration-driven `risk_taxonomies` | Auditable; changeable without code deploy | — |

## Output requirements

- Output file: `docs/output/01_executive_summary.md`
- Start with `## 1. Executive summary`
- End with `---`
- All table names and route names in `inline code`
- Every forward-looking KPI marked `target`
