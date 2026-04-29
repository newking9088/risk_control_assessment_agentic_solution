# Global authoring rules — include in every section prompt

> **These rules apply to every section of the RCA Architecture Document.
> Every section prompt references this file. Do not repeat them inline — just follow them.**

## Project identity

- **Document title:** "AI-Driven Risk & Control Assessment — Technical Design and Architecture"
- **Output file:** `docs/output/RCA_Architecture_<YYYYMMDD>.md`
- **Platform short-name:** RCA (Risk & Control Assessment)
- **Repos in context:**
  - App repo: `risk_control_assessment_agentic_solution`
  - IaC repo: Terraform infrastructure repo

## Rule 1 — Ground every statement in the repo

Cite exact file paths, module names, class names, function names, Terraform module versions, env vars, table names, route paths. No fabricated components. If something is described in `project_setup_prompt.md` but not yet implemented, mark it **[Gap — Phase N]**.

## Rule 2 — Tables over prose

Use GitHub-flavored markdown tables whenever content is comparable, enumerable, or matrix-shaped (capabilities, NFRs, RBAC, ADR options, risks, etc.).

## Rule 3 — Diagrams as Mermaid

Use fenced Mermaid blocks (`flowchart`, `sequenceDiagram`, `erDiagram`, `stateDiagram`, `C4Context`). Every major section must include at least one diagram. Keep diagrams legible (≤ 25 nodes); split into multiple diagrams if larger.

## Rule 4 — Two deployment plans side-by-side

Where meaningful, show both:
- **Plan A — Cloud-Agnostic / On-Premises:** Kubernetes + Helm (`deploy/on-premise/helm/`), self-hosted PostgreSQL+pgvector, Redis, LiteLLM, Better Auth, FAISS in-process
- **Plan B — Azure-Native (Enterprise):** AKS/vCluster, Azure PostgreSQL Flexible + pgvector, Azure Cache for Redis, Azure OpenAI (Cognitive Services), Azure AI Search, Service Bus, Azure Blob + BYOK, Key Vault, Log Analytics

## Rule 5 — Multi-tenancy is first-class

Always reference `app.tenants` table, RLS via `set_config('app.current_tenant_id', ...)`, and `multiTenancy` Helm values.

## Rule 6 — AI/LLM concerns explicit

Call out: prompt safety, PII handling, cost, observability, human-in-the-loop, evaluation — wherever AI is discussed.

## Rule 7 — Compliance lens

Map every relevant claim to at least one of: GDPR, SOC 2 Type II, SOX ICFR, SR 11-7, FFIEC, IIA IPPF Std, COSO ERM 2017.

## Rule 8 — Traceability

Every architectural component must map back to a business capability in Section 7 (Requirements Traceability Matrix).

## Rule 9 — Assumptions & gaps explicit

Never silently invent. Mark gaps as **[Gap — Phase N]** and assumptions as **[Assumption: …]**.

## Rule 10 — Style

- US English
- ISO dates (YYYY-MM-DD)
- Sentence-case headings
- All file paths, table names, module names, env vars in `inline code`
- No marketing adjectives ("revolutionary", "seamless", "cutting-edge", "game-changing")
- H1 only for document title; H2 for numbered top-level sections; H3/H4 for subsections

## Heading & numbering scheme

The document uses this exact numbering — do not deviate:

```
# AI-Driven Risk & Control Assessment — Technical Design and Architecture
## 1. Executive summary
### 1.1 Solution overview
### 1.2 Plan A vs. Plan B high-level comparison
### 1.3 Key design decisions summary
## 2. Architecture diagrams
### 2.1 Logical architecture
### 2.2 Physical / deployment architecture
### 2.3 Data architecture
### 2.4 AI / agent orchestration architecture
### 2.5 Integration architecture
### 2.6 Security architecture
### 2.7 Key workflow sequence diagrams
## 3. Technical specifications
### 3.1 UI layer architecture
### 3.2 Backend / service decomposition
### 3.3 Data model
### 3.4 AI / agent architecture
### 3.5 RAG implementation
### 3.6 Enterprise integrations
## 4. Non-functional requirements
### 4.1 Security & compliance
### 4.2 AI guardrails & policy enforcement
### 4.3 Observability & operations
### 4.4 Scalability & reliability
### 4.5 Cost optimization
## 5. Implementation approach
### 5.1 Phased delivery roadmap
### 5.2 Development practices
## 6. Appendix 1 — Architecture decision records (ADRs)
## 7. Appendix 2 — Requirements traceability matrix
```
