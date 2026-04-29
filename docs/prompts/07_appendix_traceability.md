# Section prompt 07 — Appendix 2: Requirements traceability matrix
# Part 8 of 8 | Output file: docs/output/07_appendix_traceability.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 8 of 8** of the RCA Architecture Document — **Section 7: Appendix 2 — Requirements traceability matrix**.

This section is the compliance anchor of the document. Every component must be justified by a requirement. Every requirement must map to a component. No gold-plating, no orphaned components.

## Repos to read

- `project_setup_prompt.md` — full capability list
- `backend/app/routes/` and `backend/app/services/` — every service
- `db_provisioning/db/init/` — every table
- All prior section outputs (01–06) for cross-references

## What to produce

Output heading: `## 7. Appendix 2 — Requirements traceability matrix`

---

### Requirements traceability matrix

For each business capability row, provide:
`REQ-ID | Business capability | Source | Architecture component(s) | Section ref | Coverage`

Coverage values: `Full` | `Partial — <mitigation/assumption>` | `None — <gap + phase>`

| REQ-ID | Business capability | Source | Architecture component(s) | Section ref | Coverage |
|---|---|---|---|---|---|
| REQ-001 | 7-step risk & control assessment workflow | `project_setup_prompt.md` §Phase 5 | `new_assessment`, `risk_applicability`, `generate_inherent_risk_ratings`, `generate_mapped_risks`, `generate_residual_risk`, `assessment_au_scorecard` routers; `app.assessments`, `app.assessment_risks`, `app.assessment_controls` | §3.2, §2.4 | Full |
| REQ-002 | AI-assisted risk applicability with evidence grounding | `project_setup_prompt.md` | `services/risk_applicability/`, `assessment_chunks` (pgvector/FAISS retrieval), `backend/app/prompts/` | §3.4, §3.5 | Full |
| REQ-003 | Inherent risk rating (L × I) with LLM rationale | `project_setup_prompt.md` | `services/risk_mapping/`, `generate_inherent_risk_ratings` | §3.4 | Full |
| REQ-004 | Control mapping and gap detection | `project_setup_prompt.md` | `generate_mapped_risks`, `services/risk_mapping/` | §3.4 | Full |
| REQ-005 | Control effectiveness scoring with evidence | `project_setup_prompt.md` | `services/scorecard/` | §3.4 | Full |
| REQ-006 | Deterministic residual risk computation | `project_setup_prompt.md` | `generate_residual_risk` (no LLM; deterministic matrix) | §3.4 | Full |
| REQ-007 | Full audit trail for all AI decisions | `project_setup_prompt.md`; SR 11-7 | `app.audit_events`, `app.chat_telemetry`; prompt + chunks + model + user + timestamp per decision | §4.1, §4.2 | Full |
| REQ-008 | Human-in-the-loop approval gate | `project_setup_prompt.md`; SR 11-7 | WIP state machine (`app.wip_sessions`), `app.approval_requests` | §4.2 | Full |
| REQ-009 | Multi-tenancy with strict data isolation | `project_setup_prompt.md` | `app.tenants`, RLS via `set_config`, `tenant_id` on all `app.*` tables | §2.6, §3.3 | Full |
| REQ-010 | RBAC (viewer / analyst / delivery_lead) | `project_setup_prompt.md` | `require_minimum_role()` middleware; `app.role_config`; Better Auth roles | §2.6, §3.2 | Full |
| REQ-011 | Document upload and RAG pipeline | `project_setup_prompt.md` | `risk_control_upload`, extraction (`pdfplumber`, `PyMuPDF`, `python-docx`, `openpyxl`), `backend/app/core/`, FAISS + pgvector | §3.5 | Full |
| REQ-012 | Real-time AI generation progress (SSE) | `project_setup_prompt.md` | `sse_events.py`, Redis pub/sub, `useSSE` hook (frontend) | §3.2, §3.1 | Full |
| REQ-013 | Chat assistant (RAG-based Q&A on AU documents) | `project_setup_prompt.md` | `chatbot/`, `chat_assistant` router, `app.chat_messages`, `app.chat_telemetry` | §3.4, §2.4 | Full |
| REQ-014 | Taxonomy management (configuration-driven) | `project_setup_prompt.md` | `taxonomy_schema`, `taxonomy_management` routers; `app.taxonomy_schemas`, `app.schema_change_log` | §3.2 | Full |
| REQ-015 | Approval and collaboration workflow | `project_setup_prompt.md` | `approvals`, `collaborators` routers; `app.approval_requests`, `app.collaborators` | §3.2 | Full |
| REQ-016 | Notifications | `project_setup_prompt.md` | `notifications` router; `app.notifications` | §3.2 | Full |
| REQ-017 | PDF report export | `project_setup_prompt.md` | `jsPDF`, `html2pdf.js`, `html-to-image` (frontend) | §3.1 | Full |
| REQ-018 | Assessment summary with AI-generated observations | `project_setup_prompt.md` | `assessment_au_scorecard`, `assessment_summaries` | §3.4 | Full |
| REQ-019 | On-prem / cloud-agnostic deployment (Plan A) | `project_setup_prompt.md` | `deploy/on-premise/helm/`; Docker Compose; pluggable `BLOB_PROVIDER`, `LLM_PROVIDER`, `AUTH_PROVIDER` | §2.2, §5.1 | Full |
| REQ-020 | Azure-native deployment (Plan B) | `project_setup_prompt.md` | IaC repo Terraform modules; AKS; Azure PostgreSQL Flexible; Azure Blob + BYOK; Key Vault | §2.2 | Full |
| REQ-021 | GDPR compliance (data minimisation, erasure) | GDPR Arts. 5, 17, 32 | Legal-hold flag; soft-delete; no PII in logs; PII classification | §4.1 | Partial — bulk erasure API is [Gap — Phase 3] |
| REQ-022 | SOX ICFR audit trail (7-year retention) | SOX ICFR | `app.audit_events`; 7-year retention policy; legal-hold | §4.1, §3.3 | Full |
| REQ-023 | SR 11-7 model risk management | Federal Reserve SR 11-7 | Prompt + model + tokens logged; HITL; golden-set eval; override logging | §4.2 | Partial — formal model validation programme is [Gap — Phase 3] |
| REQ-024 | SOC 2 Type II evidence | AICPA SOC 2 | `audit_events`; access logs; encryption; RBAC; incident runbook | §4.1 | Partial — formal audit engagement not yet initiated [Gap — Phase 3] |
| REQ-025 | Observability and alerting | `project_setup_prompt.md` | Prometheus + Grafana (Plan A) / Azure Monitor (Plan B); `python-json-logger`; alert thresholds | §4.3 | Full (Plan A); Partial (Plan B — [Gap — Phase 3]) |
| REQ-026 | Cost allocation per tenant | `project_setup_prompt.md` | `chat_telemetry` token logging; resource quotas; chargeback report | §4.5 | Partial — chargeback report UI is [Gap — Phase 3] |

---

### Coverage summary table

| Category | Full | Partial | None | Total |
|---|---|---|---|---|
| Core workflow (REQ-001 to REQ-007) | 7 | 0 | 0 | 7 |
| HITL & governance (REQ-008) | 1 | 0 | 0 | 1 |
| Multi-tenancy & RBAC (REQ-009 to REQ-010) | 2 | 0 | 0 | 2 |
| AI / RAG capabilities (REQ-011 to REQ-018) | 8 | 0 | 0 | 8 |
| Deployment (REQ-019 to REQ-020) | 2 | 0 | 0 | 2 |
| Compliance & security (REQ-021 to REQ-024) | 1 | 3 | 0 | 4 |
| Observability & cost (REQ-025 to REQ-026) | 1 | 1 | 0 | 2 |
| **Total** | **22** | **4** | **0** | **26** |

---

### Partially-covered requirements — mitigation & assumptions

| REQ-ID | Gap | Phase | Mitigation until resolved |
|---|---|---|---|
| REQ-021 | Bulk erasure API for GDPR right-to-erasure at scale | Phase 3 | Manual process via `delivery_lead` admin console; legal-hold flag prevents accidental deletion |
| REQ-023 | Formal SR 11-7 model validation programme (independent validation, ongoing monitoring programme) | Phase 3 | Architecture provides evidence artefacts (`audit_events`, golden-set eval); formal programme requires risk practice engagement |
| REQ-024 | Formal SOC 2 Type II audit engagement | Phase 3 | Architecture designed for SOC 2 evidence; audit engagement to be initiated after Phase 3 hardening |
| REQ-025 | Plan B Azure Monitor / Log Analytics full configuration | Phase 3 | Plan A Prometheus stack fully operational; Plan B IaC module scaffolded but not yet deployed |
| REQ-026 | Chargeback report UI in admin console | Phase 3 | Token costs logged in `chat_telemetry`; manual SQL export available to `delivery_lead` |

---

### Design-components-to-requirements reverse mapping

Every component is justified by at least one REQ-ID. No gold-plating.

| Component | Justified by |
|---|---|
| `services/risk_applicability/` | REQ-002 |
| `services/risk_mapping/` | REQ-003, REQ-004 |
| `services/scorecard/` | REQ-005 |
| `generate_residual_risk` | REQ-006 |
| `app.audit_events` | REQ-007, REQ-022, REQ-023 |
| `app.wip_sessions`, `app.approval_requests` | REQ-008, REQ-015 |
| `app.tenants` + RLS | REQ-009 |
| `require_minimum_role()`, `app.role_config` | REQ-010 |
| `backend/app/core/` (chunking, embedding) | REQ-011 |
| FAISS in-process | REQ-011, REQ-002 |
| `app.assessment_chunks` (pgvector) | REQ-011, REQ-002 |
| `sse_events.py` + Redis pub/sub | REQ-012 |
| `chatbot/`, `chat_assistant` | REQ-013 |
| `app.taxonomy_schemas`, `schema_change_log` | REQ-014 |
| `app.collaborators` | REQ-015 |
| `app.notifications` | REQ-016 |
| `jsPDF`, `html2pdf.js` (frontend) | REQ-017 |
| `assessment_au_scorecard`, `assessment_summaries` | REQ-018 |
| `deploy/on-premise/helm/` | REQ-019 |
| IaC Terraform modules | REQ-020 |
| Legal-hold flag, soft-delete | REQ-021 |
| 7-year retention policy | REQ-022 |
| `app.chat_telemetry` | REQ-013, REQ-023, REQ-026 |
| `prometheus-fastapi-instrumentator` | REQ-025 |

---

### Assumptions made

| # | Assumption | Basis | Impact if incorrect | Validation required |
|---|---|---|---|---|
| A01 | Analyst has browser access to the platform (no offline mode) | `project_setup_prompt.md` | Offline-capable PWA would require significant rework | Confirm with risk practice leadership |
| A02 | Single region deployment in Phase 1–2 | `project_setup_prompt.md` | Multi-region would require active-active DB replication strategy | Confirm DR requirements |
| A03 | LLM API (OpenAI / Azure OpenAI) available with < 30 s p95 latency | External SLA | Degrade gracefully; circuit breaker opens; manual fallback | Load test LLM API under expected concurrency |
| A04 | FAISS index can be rebuilt in < 30 s on pod restart for Phase 1–2 corpus size | Estimated corpus ~50k chunks | Larger corpus requires persistent FAISS or pgvector-only strategy | Benchmark on staging corpus |
| A05 | Taxonomy is stable during an active assessment cycle | Risk practice policy | Taxonomy changes mid-assessment could invalidate ratings | Confirm change-freeze policy with practice |
| A06 | `delivery_lead` role is sufficient for all admin actions; no super-admin role needed | RBAC design | If multi-level admin needed, `app.role_config` must be extended | Confirm with practice leadership |
| A07 | All uploaded documents are in supported formats (PDF, Word, Excel) | File validation in upload route | Unsupported formats (e.g., scanned images without OCR) would fail extraction | Confirm document types in scope |
| A08 | 7-year retention satisfies all applicable audit requirements | SOX ICFR; IIA IPPF | If a jurisdiction requires longer, retention policy must be extended | Confirm with compliance team |

---

### Gap analysis — potentially missing requirements

| Gap | Current state | Proposed interpretation | Priority |
|---|---|---|---|
| Mobile / tablet support | Not in scope; desktop-only wizard | Responsive design possible with Shadcn/ui; not tested on mobile | Low — internal tool |
| Offline mode | No offline capability | Offline-first PWA would require Service Worker + local DB; significant effort | Low |
| Public / bulk API | No external API in v1 | REST API exists internally; public API with rate limiting and API keys is [Gap — Phase 3] | Medium |
| UI localization (i18n) | English only | `react-i18next` can be added; taxonomy strings are configuration-driven | Medium |
| WCAG AA full compliance | Shadcn/ui provides baseline; `axe-core` in CI | Full audit + remediation needed; Lighthouse CI score gate at 90 | High — if regulated |
| Bulk document export | PDF per assessment only | Bulk ZIP export of all assessment artefacts is [Gap — Phase 3] | Medium |
| DR testing cadence | DR plan documented; testing not scheduled | Quarterly DR drill should be added to ops calendar | High |
| Pen-testing cadence | Trivy + OWASP ZAP in CI; no formal pen test | Annual external pen test recommended before SOC 2 audit | High |
| User training programme | `AGENTS.md` for developers; no end-user training | Analyst onboarding guide needed; video walkthrough for 7-step wizard | Medium |

---

### Sign-off block

| Role | Name | Date | Signature |
|---|---|---|---|
| Solution Architect | | | |
| Technical Lead | | | |
| Product Owner | | | |
| Compliance Representative | | | |

---

## Version history

| Version | Date | Author | Change summary |
|---|---|---|---|
| 1.0 | <today ISO> | | Initial draft |

---

## Glossary

| Term | Definition |
|---|---|
| AU | Auditable Unit — the organisational unit or process scope of a single assessment |
| RAG | Retrieval-Augmented Generation — retrieval of document chunks to ground LLM outputs |
| RLS | Row-Level Security — PostgreSQL feature that filters rows by session variable |
| BYOK | Bring Your Own Key — customer-managed encryption key via Key Vault |
| HITL | Human-In-The-Loop — mandatory analyst review before AI output is persisted |
| SSE | Server-Sent Events — unidirectional HTTP push from server to browser |
| TFE | Terraform Enterprise — managed Terraform with remote state and approval workflows |
| FAISS | Facebook AI Similarity Search — in-process vector similarity search library |
| vCluster | Virtual Kubernetes Cluster — lightweight K8s cluster running inside a host cluster |
| FFIEC | Federal Financial Institutions Examination Council |
| IIA IPPF | Institute of Internal Auditors — International Professional Practices Framework |
| COSO ERM | Committee of Sponsoring Organisations — Enterprise Risk Management framework |
| SR 11-7 | Federal Reserve / OCC Supervisory Guidance on Model Risk Management |
| RCSA | Risk and Control Self-Assessment |
| RCA | Risk & Control Assessment (this platform) |
| WIP | Work In Progress — draft state of an assessment step before analyst approval |
| ADR | Architecture Decision Record |
| LLM | Large Language Model |
| pgvector | PostgreSQL extension for vector similarity search |
| CMK | Customer-Managed Key (used in BYOK context) |
| SAST | Static Application Security Testing |
| DAST | Dynamic Application Security Testing |
| SBOM | Software Bill of Materials |
| SLSA | Supply-chain Levels for Software Artifacts |

## Output requirements

- Output file: `docs/output/07_appendix_traceability.md`
- Start with `## 7. Appendix 2 — Requirements traceability matrix`
- End with the Glossary section (no trailing `---`)
- This is the last section — do not add "End of document" or similar
