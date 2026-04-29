# Section prompt 05 — Implementation approach
# Part 6 of 8 | Output file: docs/output/05_implementation_approach.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 6 of 8** of the RCA Architecture Document — **Section 5: Implementation approach**.

This section is read by delivery leads and engineering managers. It must be concrete — reference actual CI/CD workflow filenames, branch names, and tool versions. No generic agile boilerplate.

## Repos to read

- `project_setup_prompt.md` — phases, branch strategy, CI/CD workflows
- `.github/workflows/` — all workflow files
- `deploy/on-premise/helm/` — Helm chart structure
- `infrastructure/` (IaC repo) — Terraform modules

## What to produce

Output heading: `## 5. Implementation approach`

---

### 5.1 Phased delivery roadmap

**Phase overview table:**

| Phase | Name | Duration `target` | Deliverables | Success criteria |
|---|---|---|---|---|
| 0 | Foundation | 4 weeks | Repo scaffold, Docker Compose, DB schema (`db_provisioning/db/init/`), auth service, CI pipeline (`ci.yml`) | `make start` brings up full local stack; auth login works; health checks pass |
| 1 | MVP | 8 weeks | 7-step wizard (manual, no AI), RBAC (`viewer`/`analyst`/`delivery_lead`), audit trail (`app.audit_events`), basic taxonomy (`app.taxonomy_schemas`) | End-to-end assessment completable without AI; all steps validated; PDF export works |
| 2 | AI enablement | 10 weeks | RAG pipeline, risk applicability, inherent/residual ratings, control mapping, chatbot, HITL gates (`app.wip_sessions`, `app.approval_requests`) | AI drafts reviewed and approved by analysts; ≥ 70% 1st-pass approval rate `target` |
| 3 | Scale & hardening | 8 weeks | Multi-tenancy RLS hardening, Plan B Azure IaC deploy, observability stack, SOC 2 evidence packaging | SOC 2 Type II evidence packageable; Plan B deployed in staging |

**Phase 2 AI enablement detail — milestone table:**

| Milestone | Services / routes | Done when |
|---|---|---|
| Document ingestion pipeline | `risk_control_upload`, `backend/app/core/` | PDF/Word/Excel extracted, chunked, embedded, stored in FAISS + pgvector |
| Risk applicability | `risk_applicability`, `services/risk_applicability/` | Analyst can review and approve AI-proposed applicability per risk |
| Inherent risk rating | `generate_inherent_risk_ratings`, `services/risk_mapping/` | L × I ratings proposed with rationale; analyst can override |
| Control mapping | `generate_mapped_risks` | Controls mapped to risks; gap flags surfaced |
| Residual risk | `generate_residual_risk` | Deterministic matrix runs on approved inputs |
| Assessment scorecard | `assessment_au_scorecard`, `assessment_summaries` | Summary generated; analyst edits and signs off |
| Chat assistant | `chatbot/`, `chat_assistant` | SSE streaming Q&A works; `chat_telemetry` logged |
| HITL enforcement | `app.wip_sessions`, `app.approval_requests` | WIP state machine enforced in code; nothing persisted without approval |

---

### 5.2 Development practices

**Repository relationship diagram** (Mermaid `flowchart LR`):

```
App repo (risk_control_assessment_agentic_solution)
  ├── backend/
  ├── frontend/
  ├── auth-service/
  ├── deploy/on-premise/helm/
  └── .github/workflows/
          │
          │ CI builds image, tags with SHA
          │ writes new image tag to GitOps repo
          ▼
GitOps repo (gitops-repo)
  └── apps/risk-assessment/
        ├── dev/values.yaml       ← image.tag: feature-abc1234
        ├── staging/values.yaml
        └── production/values.yaml  ← image.tag: 1.4.0
          │
          │ Argo CD watches GitOps repo
          ▼
Kubernetes cluster (Plan A) / AKS (Plan B)
```

IaC repo (separate):
- Manages Azure resources (Plan B) via Terraform
- Never touched by app CI — separate review/approval pipeline

**Branch strategy and auto-deploy rules:**

| Branch pattern | Who creates | Auto-deploy target | Approval required |
|---|---|---|---|
| `feature/*` | Developer | `dev` only | None |
| `hot-release/*` | Developer (urgent fix) | `dev` → `staging` fast-path | Staging: 1 approval |
| `release/x.y.z` | Automation (`create-release-branch.yaml`) | `dev` → `staging` → `prod` | Prod: approval gate |
| `main` | Merge of release PR | Canary tag on `ghcr.io` + `dev` | None |

**CI/CD pipeline diagram** (Mermaid `flowchart TD`):

Show the following flows:
- `feature/*` push → `ci.yml` (lint + test + secret-scan) → `build-and-push.yml` → `update-gitops.yml` (dev)
- `release/x.y.z` → same CI → build → update dev → staging (approval) → prod (approval)
- `main` push → `canary.yml` → canary image + GitHub Release

**GitHub Actions workflow inventory:**

| Workflow file | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR to main, push to main | Lint (ruff, black, mypy, eslint, tsc), test (pytest, vitest), secret-scan (gitleaks), SAST (Bandit, Semgrep) |
| `build-and-push.yml` | Push to feature/*, hot-release/*, release/*, main | Build 3 images (api, ui, auth); cosign signing; SLSA provenance |
| `_build-image.yml` | Called by build-and-push.yml | Reusable Docker build; multi-arch (amd64 + arm64); GHA cache |
| `update-gitops.yml` | After build-and-push succeeds | Write new image tag into GitOps repo `values.yaml` |
| `create-version-bump-pr.yaml` | Schedule: Tuesday midnight UTC | Compute next minor version; open `version-bump/x.y.z` PR |
| `create-release-branch.yaml` | version-bump PR merged to main | Create `release/x.y.z` branch; auto-changelog; open Release PR |
| `check-release-pr.yaml` | PR opened to main from release/* | Verify all commits are cherry-picks from main; block merge otherwise |
| `patch-release.yaml` | `workflow_dispatch` | Create patch release from existing release branch |
| `canary.yml` | Push to main | Build canary image (`canary+<sha>`); create/update GitHub Release |
| `ai-pr-reviewer.yml` | Comment `/review` on PR | AI-powered code review; OWNER/MEMBER/COLLABORATOR only; injection-safe heredoc |
| `ai-issue-solver.yml` | Comment `/fix` on issue | AI agent → branch → PR; blocks `.github/` changes by AI |
| `secret-scan.yml` | Every push + PR | `gitleaks` — blocks on any hardcoded credential found |
| `dependency-scan.yml` | PR (dep file changes) + weekly Monday | `pip-audit`, `npm audit`, Trivy container scan |
| `sbom.yml` | Push to `v*.*.*` tags | `syft` generates CycloneDX SBOM; attached to GitHub Release |

**Image naming convention:**

| Branch | Tag format | Example |
|---|---|---|
| `feature/*` | `feature-<short-sha>` | `ghcr.io/org/rca-api:feature-abc1234` |
| `hot-release/*` | `hotrelease-<short-sha>` | `ghcr.io/org/rca-api:hotrelease-def5678` |
| `release/x.y.z` | `x.y.z`, `x.y`, `x` (semver) | `ghcr.io/org/rca-api:1.4.0` |
| `main` | `canary+<short-sha>`, `latest` | `ghcr.io/org/rca-api:canary+abc1234` |

**Rule:** Never use `:latest` in production manifests. All `uses:` in GitHub Actions pinned to full commit SHA with `# vX.Y.Z` comment (supply-chain attack prevention).

**AI-specific pipeline security rules:**
- After AI agent (`ai-pr-reviewer.yml`, `ai-issue-solver.yml`) runs, verify it did not touch `.github/` directory:
  ```bash
  if git diff --name-only | grep -q "^\.github/"; then
    echo "::error::AI must not modify workflows"
    git checkout -- .github/; exit 1
  fi
  ```
- PR diff passed to AI via random-delimiter heredoc (prevents prompt injection from PR content)
- `/review` and `/fix` commands only accepted from OWNER/MEMBER/COLLABORATOR (`author_association` check)

**Testing strategy table:**

| Test type | Tool(s) | Scope | Trigger | Pass criteria |
|---|---|---|---|---|
| Unit (backend) | `pytest` | Routes, services, utilities | Every PR | ≥ 80% coverage on new code |
| Unit (frontend) | `Vitest` + `@testing-library/react` | Hooks, utilities, components | Every PR | All tests pass |
| Integration (backend) | `pytest` + real test DB (no mocks) | DB queries, auth flow, API contracts | Every PR | All tests pass against real PostgreSQL |
| E2E | `Playwright` / `Cypress` | 7-step wizard golden path, auth flows | Pre-release | All golden paths pass |
| Contract | `pytest` | Backend API shape vs. frontend expectations | Every PR | No contract drift |
| Security (SAST) | Bandit, Semgrep | Python + TypeScript | Every PR | 0 high/critical findings |
| Security (DAST) | OWASP ZAP | Staging environment | Pre-release | 0 high findings |
| Container | Trivy | Docker images | Every build | 0 critical CVEs |
| AI evaluation | Custom golden-set eval | LLM output quality per use case | Monthly + on model change | Recall ≥ 80% on golden set `target` |
| AI adversarial | Custom + human review | Prompt injection, bias, hallucination | Monthly | 0 prompt injection successes |
| Accessibility | `axe-core`, Lighthouse CI | Frontend | Every PR | Lighthouse accessibility ≥ 90 |

**AGENTS.md key rules** (for AI coding agents working in this repo):
- This is a `uv`-based project. Run all Python commands through `uv run`.
- Never commit secrets, `.env` files, or credentials. Use vault references only.
- All FastAPI routes use `root_path="/api"`. Define routes WITHOUT the `/api/` prefix.
- All routes versioned under `/v1/` (e.g., `router = APIRouter(prefix="/v1/assessments")`).
- Use raw SQL with psycopg3 parameterized queries (`%s`). Never use string formatting in SQL.
- Never expose stack traces in HTTP error responses.
- File uploads must validate MIME type, magic bytes, and size before processing.
- Never use `dangerouslySetInnerHTML`. Use `DOMPurify.sanitize()` if raw HTML is unavoidable.
- All new API endpoints must specify RBAC: `require_minimum_role("viewer"|"analyst"|"delivery_lead")`.
- Do not mock the database in integration tests — use a real test DB.

## Output requirements

- Output file: `docs/output/05_implementation_approach.md`
- Start with `## 5. Implementation approach`
- End with `---`
- All workflow file names in `inline code`
