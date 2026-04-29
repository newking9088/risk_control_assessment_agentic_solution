# Repo Refinement Prompt

You are working in the repo `'/Users/anita/Documents/risk_control_assessment_agentic_solution'`.
There is a known-good reference implementation at some other machine which we do not have access to at `'/Documents/ai-driven-fraud-risk-assessment'` that already runs well with `make install && make db-fresh && make start`.

**Goal:** bring this repo to the same level. After you are done, a fresh checkout should be runnable with:

```bash
cp backend/.env.example backend/.env      # user fills OPENAI_API_KEY
cp auth-service/.env.example auth-service/.env
cp .env.example .env                       # for docker-compose variables
make install
make db-fresh
make start
```

...and the user should be able to:

1. Open `http://localhost:3000`
2. Sign in with the credentials shown in `make start` output
3. Click "Create New Assessment"
4. Walk all 7 wizard steps (Preparation → Questionnaire → Identify Risks → Inherent Risk → Evaluate Controls → Residual Risk → Summary) without any 500 / 404 / RLS errors, with state persisted across reloads.
5. See the radar chart + risk register populated in Step 7.

Treat the reference repo as **READ-ONLY** — only use it for design patterns (routes, schema, env, Makefiles, Dockerfiles, nginx, vite proxy, Better Auth mounting, role config). Do not copy proprietary content (PwC AppKit, real emails, real LLM keys); use the generic "RCA" branding and `viewer/analyst/delivery_lead` role triple already present in our repo.

Required scope of work, in order. After each section, run the relevant smoke test before moving on.

---

## SECTION 1 – Python packaging and env so the backend imports cleanly

**1.1** Add `__init__.py` to `backend/app/`, `backend/app/config/`, `backend/app/middleware/`, `backend/app/infra/`, `backend/app/routes/` (only `routes/__init__.py` exists). Without these, `from app.config.settings import *` fails on Python 3.13.

**1.2** Fix `backend/.env.example`:
- `DATABASE_URL=postgresql://adminuser:adminuser_local_pw@localhost:5432/appdb`
  (psycopg3 cannot parse the SQLAlchemy `postgresql+psycopg://` form that is currently committed — verify in `app/infra/db.py`).
- Default `BLOB_PROVIDER=local` and add `LOCAL_BLOB_PATH=./data/blobs` so the backend boots without Azure/MS creds.
- Drop `REDIS_URL` password from default to match the local compose.
- Mirror the change in `app/config/settings.py` (add `local_blob_path`).

**1.3** Smoke test:
```bash
cd backend && uv sync && uv run python -c "from app.main import app; print(app.title)"
```

---

## SECTION 2 – docker-compose & local infra so `make db-up` works

**2.1** Top-level `.env.example` with `POSTGRES_DB=appdb`, `POSTGRES_USER=adminuser`, `POSTGRES_PASSWORD=adminuser_local_pw`, `REDIS_PASSWORD=redis_local_pw`. The current `docker-compose.yml` uses `${POSTGRES_PASSWORD:?}` and will refuse to start until this exists.

**2.2** Update `docker-compose.yml`:
- Add `container_name` to each service (so Makefile can `docker exec` against a known name).
- Tighten healthchecks (`pg_isready -U adminuser -d appdb`, `redis-cli -a $REDIS_PASSWORD ping`).
- Mount init scripts read-only.

**2.3** Add `docker-compose.local.yml` (parallels the reference) that brings up the full stack — db, redis, auth-service, backend, frontend (nginx) — for users who want one-command local. Use multi-stage Dockerfiles (frontend Dockerfile + nginx config still need to be created — see Section 6).

---

## SECTION 3 – Database schema parity with the wizard contract

The frontend wizard, the FastAPI routes, and `db_provisioning/db/init/001_app_schema.sql` are out of sync. Reconcile by **amending** the schema (and route SQL) so the wizard's API contract works.

**3.1** `app.assessments` — required columns the wizard reads / writes:
```sql
title TEXT NOT NULL,
description TEXT,
scope TEXT,
assessment_date DATE,
owner TEXT,
business_unit TEXT,
current_step INT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 7),
questionnaire JSONB NOT NULL DEFAULT '{}',
questionnaire_notes JSONB NOT NULL DEFAULT '{}'
```
Replace the `au_name` column (or keep it suitable for backwards-compat and add `title`). Update the status CHECK to allow `('draft','in_progress','review','complete','archived')` — the dashboard renders all five.

**3.2** `app.assessment_risks` — drop the LLM-mapping-only shape and use:
```sql
name TEXT NOT NULL,
category TEXT NOT NULL,
source TEXT NOT NULL CHECK (source IN ('EXT','INT')),
description TEXT,
inherent_likelihood TEXT CHECK (inherent_likelihood IN ('low','medium','high','critical')),
inherent_impact     TEXT CHECK (inherent_impact     IN ('low','medium','high','critical')),
residual_likelihood TEXT CHECK (residual_likelihood IN ('low','medium','high','critical')),
residual_impact     TEXT CHECK (residual_impact     IN ('low','medium','high','critical')),
taxonomy_risk_id TEXT  -- optional pointer into a future taxonomy
```
Keep `applicable`, `rationale`, `approved_by`, `created_at`.

**3.3** `app.assessment_controls` — wizard contract:
```sql
name TEXT NOT NULL,
control_ref TEXT,
type TEXT CHECK (type IN ('Preventive','Detective','Corrective','Directive')),
is_key BOOLEAN NOT NULL DEFAULT FALSE,
description TEXT,
design_effectiveness    INT CHECK (design_effectiveness BETWEEN 1 AND 4),
operating_effectiveness INT CHECK (operating_effectiveness BETWEEN 1 AND 4),
overall_effectiveness TEXT CHECK (overall_effectiveness IN
  ('Effective','Partially Effective','Needs Improvement','Ineffective','Not Tested')),
rationale TEXT,
evidence_ref TEXT,
approved_by UUID
```
Drop the `design_eff/operating_eff` TEXT columns.

**3.4** RLS: every `app.*` table has `ENABLE ROW LEVEL SECURITY` but four are missing a `tenant_isolation` policy. Add one per table. For the join-only children (`assessment_risks`, `assessment_controls`, `assessment_documents`, `wip_sessions`, `approval_requests`), use:
```sql
USING (EXISTS (SELECT 1 FROM app.assessments a
               WHERE a.id = <table>.assessment_id
                 AND a.tenant_id = current_setting('app.current_tenant_id', true)::uuid));
```
Also `GRANT USAGE ON SCHEMA app, USAGE+SELECT ON ALL SEQUENCES, ALL ON ALL TABLES IN SCHEMA app TO adminuser;` so non-superuser roles work.

**3.5** `auth.user` schema:
- The CHECK constraint says `role IN ('viewer','analyst','delivery_lead')`. Standardise the entire codebase on this triple. Update README, auth-service seed, and middleware/permissions to match. Do NOT use `admin/manager` anywhere.
- Add `tenant_id UUID` column (Better Auth `additionalFields.tenantId` requires a matching column).

**3.6** Add a real seed step: `db_provisioning/db/init/003_seed.sql` that inserts the default tenant (already in 001) and any taxonomy demo row. Do NOT seed users from SQL — let the auth-service `seed.ts` own that path.

---

## SECTION 4 – Backend routes that match the wizard

The wizard hits these endpoints (verify by grep `api.get|api.post|api.patch|api.delete` under `frontend/src`). None of them are implemented yet.

**4.1** In `app/main.py`, mount every router under the `/api` prefix (the current `root_path="/api"` only affects OpenAPI links; it does NOT prefix the actual paths). Either:
- (a) change every router `prefix="/api/v1/..."`, OR
- (b) wrap with `app.include_router(router, prefix="/api")`.

The frontend assumes (b)-style URLs (`/api/v1/assessments`).

**4.2** Replace the current `routes/risks.py` and `routes/controls.py` (they model an LLM-mapping flow that the wizard never calls) with:

```
GET    /v1/assessments
POST   /v1/assessments                           body: { title }
GET    /v1/assessments/{id}
PATCH  /v1/assessments/{id}                      body: any subset of editable cols
DELETE /v1/assessments/{id}                      (soft delete)
GET    /v1/assessments/{id}/risks
POST   /v1/assessments/{id}/risks                body: { name, category, source, description }
PATCH  /v1/assessments/{id}/risks/{riskId}
DELETE /v1/assessments/{id}/risks/{riskId}
GET    /v1/assessments/{id}/controls
POST   /v1/assessments/{id}/controls             body: { risk_id, name, type, is_key, description }
PATCH  /v1/assessments/{id}/controls/{controlId}
DELETE /v1/assessments/{id}/controls/{controlId}
```

Use `get_tenant_cursor()` for every query (per AGENTS.md). Validate with Pydantic models. Return JSON dicts (not tuples) — use `psycopg.rows.dict_row` on the cursor.

**4.3** Keep the existing LLM-driven endpoints (`/v1/risk-applicability`, `/v1/controls/mapping`, `/v1/chat`) but move them under separate prefixes (e.g. `/v1/agent/risk-applicability`) so the wizard CRUD endpoints own the canonical `/v1/assessments/{id}/risks` URL.

**4.4** Add `PATCH /v1/assessments/{id}` support for `current_step`, `questionnaire`, `questionnaire_notes` (the wizard advances steps via this).

**4.5** Write three pytest integration tests in `backend/tests/`:
- `test_assessments_crud.py` — create, list, patch, get
- `test_risks_crud.py` — add, patch likelihood/impact, list, delete
- `test_controls_crud.py` — add, patch effectiveness, list, delete

Use the live Postgres from `make db-up` (per AGENTS.md, do NOT mock the database). Use a per-test transaction rollback fixture.

---

## SECTION 5 – Auth-service & session wiring (the #1 reason login fails today)

**5.1** `auth-service/.env.example` with:
```
AUTH_PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://adminuser:adminuser_local_pw@localhost:5432/appdb
BETTER_AUTH_SECRET=<change-me-or-we-use-a-random_rand_hex_32>
BETTER_AUTH_URL=http://localhost:3001
TRUSTED_ORIGINS=http://localhost:3000
```

**5.2** `auth-service/src/index.ts` — mount Better Auth at `/api/auth/*` (NOT `/auth/*`). Better Auth's `toNodeHandler` expects the request URL to start with the Better Auth basePath, default `/api/auth`. The backend's `middleware/auth.py` already calls `${AUTH_SERVICE_URL}/api/auth/get-session` so this aligns everything.

**5.3** `auth-service/src/auth.ts` — pass `baseURL: process.env.BETTER_AUTH_URL`, `secret: process.env.BETTER_AUTH_SECRET`, and `trustedOrigins: process.env.TRUSTED_ORIGINS.split(',')`. Without these Better Auth refuses cross-origin cookie issuance from the Vite dev server.

**5.4** `frontend/vite.config.ts` — proxy MUST forward auth correctly:
```ts
proxy: {
  '/api/auth': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    // overrides the broader /api rule for auth traffic
  },
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    // backend already mounts under /api — keep path
  },
},
```
Drop the broken `/auth` proxy entry. Note: more-specific `/api/auth` rule must come **before** the generic `/api` rule.

**5.5** `frontend/src/lib/auth.ts` — call the real Better Auth endpoints:
- `getSession` → `GET /api/auth/get-session` (returns `{ session, user }`)
- `signIn`     → `POST /api/auth/sign-in/email` body `{ email, password }`
- `signOut`    → `POST /api/auth/sign-out`

Update the `Session` interface to match the actual response shape:
```ts
{ session: { id, expiresAt, ... }, user: { id, email, role, tenantId } }
```
Update `routes/__root.tsx` and `assessments.tsx` to read `session.user` instead of session fields.

**5.6** `auth-service/src/seed.ts` — change role values to `'viewer' | 'analyst' | 'delivery_lead'` (matches the schema CHECK constraint). Three seed users:
```
analyst@example.com  / Analyst1234!  / analyst
lead@example.com     / Lead1234!     / delivery_lead
viewer@example.com   / Viewer1234!   / viewer
```
Set `tenantId: "00000000-0000-0000-0000-000000000001"`.
Update README and `make start` banner to print these three logins.

---

## SECTION 6 – Frontend completeness

**6.1** Add `frontend/.eslintrc.cjs` (typescript-eslint + react-hooks) and `frontend/vitest.config.ts` so `npm run lint` and `npm run test` don't fail.

**6.2** Add a smoke test in `frontend/src/__tests__/login.test.tsx` that renders LoginPage, submits, asserts navigate to `/assessments`.

**6.3** Add `frontend/Dockerfile` (multi-stage build — nginx) not `frontend/nginx.conf`, mirroring the reference, with `/api` and `/api/auth` proxied to the backend / auth-service services.

**6.4** Add the missing styling files referenced by route modules (`assessments.module.scss`, `login.module.scss`, `WizardLayout.module.scss`, `WizardSidebar.module.scss`, `Step.module.scss`) — verify they all exist and that the class names referenced in the TSX actually exist in the SCSS. Run `npm run build` and fix any missing-export errors.

---

## SECTION 7 – Makefile parity with the reference

**7.1** Adopt the reference's pattern:
- Single `make start` brings DB up, waits for healthcheck, runs the seeder, then launches auth/backend/frontend in the background with logs to `/tmp/rca-{auth,backend,frontend}.log`.
- `make stop` kills all three by their command signature and `docker compose down`.
- `make fresh` = `docker compose down -v` + `make start`.
- `make logs` — tails all three log files.
- `make ps` — `pgrep` running containers + processes.
- `make help` — autogenerates from `## comments` after every target.

**7.2** `make db-schema` should `docker exec` (not `compose exec`) so it works even when the compose project name doesn't match. Make it idempotent (add `OR REPLACE`, `CREATE ... IF NOT EXISTS` / `ALTER ... ADD COLUMN IF NOT EXISTS`) so re-running on an existing DB does not fail.

**7.3** `make test` must run both `cd backend && uv run pytest` and `cd frontend && npm test -- --run` and exit non-zero on failure.

---

## SECTION 8 – Backend Dockerfile system deps

**8.1** `backend/Dockerfile` runtime stage needs:
```dockerfile
RUN apt-get install -y --no-install-recommends \
    libpoppl tesseract-ocr libgl1 libglib2.0-0 poppler-utils ca-certificates
```
for FAISS, pytesseract, PyMuPDF, Pillow. Without these, `import faiss` and OCR will crash on first request.

**8.2** Bundle or download the embedding model. Either:
- (a) `COPY paraphrase-MiniLM-L6-v2/` into the image, OR
- (b) `RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-MiniLM-L6-v2')"` to pre-download to `~/.cache`.

The reference takes approach (a). Either is fine; document the choice in README.

---

## SECTION 9 – Documentation

**9.1** Rewrite `README.md` Quick Start so the documented commands ACTUALLY produce a working app. After your fixes, validate by running them literally on a clean clone (you can verify by `git stash && git clean -fd` in a worktree, or just by fresh-installing into `/tmp/rca-dryrun`). Update `docs/RUNBOOK.md` with the new make targets, log locations, and the three real demo logins.

**9.2** Update `docs/API.md` listing every endpoint above with method, path, request schema, response schema, and required role.

**9.3** Add `docs/ADR/002-postgres-rls-with-app-current-tenant.md` explaining the `set_config('app.current_tenant_id', true)` pattern and why every query goes through `get_tenant_cursor()`.

---

## SECTION 10 – End-to-end verification

After all sections, perform this smoke run yourself and paste the full terminal output into your final summary:

```bash
git clean -fdx -e .env     # don't lose user .env if any
cp backend/.env.example backend/.env
cp auth-service/.env.example auth-service/.env
cp .env.example .env
# set OPENAI_API_KEY=sk-test-fake just for boot — chat will degrade gracefully
make install
make db-fresh
make start
sleep 8
curl -sf http://localhost:8000/api/health | jq .
curl -sf http://localhost:3001/health     | jq .
# POST sign-in → capture cookie jar
curl -sf -c /tmp/cj http://localhost:3001/api/auth/sign-in/email \
     -H "content-type: application/json" \
     -d '{"email":"analyst@example.com","password":"Analyst1234!"}'
# use cookie to create + read an assessment
curl -sf -b /tmp/cj http://localhost:8000/api/v1/assessments
curl -sf -b /tmp/cj http://localhost:8000/api/v1/assessments \
     -X POST -H 'content-type: application/json' \
     -d '{"title":"Smoke test"}'
curl -sf -b /tmp/cj http://localhost:8000/api/v1/assessments
make stop
```

All four curl calls above must return `200`. `db`, `redis`, `api`, `auth` must all report `ok`. Report any non-200 with the failing endpoint and your proposed fix BEFORE moving on.

---

## Constraints / non-goals

- Do NOT introduce SQLAlchemy. The codebase uses raw psycopg3 by design.
- Do NOT mock the database in tests (per AGENTS.md).
- Do NOT change the role hierarchy weights in `middleware/permissions.py`.
- Do NOT add new dependencies if a stdlib or already-listed package can do the job.
- Do NOT generate emoji-laden output or marketing copy in code or docs.
- Keep the LLM-agent flow (RAG, control mapping, residual generation) as a Phase 2 — it is enough that those routes exist and degrade cleanly when `OPENAI_API_KEY` is unset.

When you finish each section, update `CHANGELOG.md` under `## [Unreleased]` with one bullet per change.

Begin with Section 1 and proceed sequentially. Stop and ask me only if a schema decision is genuinely ambiguous — otherwise prefer the reference repo's pattern.
