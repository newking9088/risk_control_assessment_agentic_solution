# ADR 002 — PostgreSQL RLS via `set_config('app.current_tenant_id', …, true)`

**Status:** Accepted

---

## Context

The platform is multi-tenant. Every table in the `app` schema stores rows for multiple tenants identified by a `tenant_id UUID` column (or reachable via a FK to `app.assessments.tenant_id`).

We need to enforce tenant isolation at the database layer so that a compromised application layer — a bug, a missing `WHERE tenant_id = …` clause, a future developer shortcut — cannot leak one tenant's data to another.

---

## Decision

We use **PostgreSQL Row-Level Security (RLS)** combined with a per-transaction GUC variable `app.current_tenant_id`.

### How it works

1. Every `app.*` table has `ENABLE ROW LEVEL SECURITY`.
2. Each table has exactly one policy named `tenant_isolation`:
   - Tables with a direct `tenant_id` column:
     ```sql
     USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
     ```
   - Join-only child tables (`assessment_risks`, `assessment_controls`, `assessment_documents`, `wip_sessions`, `approval_requests`):
     ```sql
     USING (EXISTS (
       SELECT 1 FROM app.assessments a
       WHERE a.id = <table>.assessment_id
         AND a.tenant_id = current_setting('app.current_tenant_id', true)::uuid
     ))
     ```
3. Every database connection that runs application queries must call `set_config` before any DML:
   ```sql
   SELECT set_config('app.current_tenant_id', '<uuid>', true)
   ```
   The third argument `true` scopes the variable to the current **transaction** only — it resets automatically on `ROLLBACK` or `COMMIT`.

4. The application enforces this via a single helper in `backend/app/infra/db.py`:
   ```python
   @asynccontextmanager
   async def get_tenant_cursor(tenant_id: str, row_factory=None):
       async with get_conn() as conn:
           async with conn.cursor(row_factory=row_factory) as cur:
               await cur.execute(
                   "SELECT set_config('app.current_tenant_id', %s, true)",
                   (str(tenant_id),),
               )
               yield cur
   ```
   **Every route that touches `app.*` tables must use `get_tenant_cursor()`** — never a raw cursor.

### Where `tenant_id` comes from

The FastAPI auth middleware (`backend/app/middleware/auth.py`) calls the auth service's `/api/auth/get-session` endpoint, extracts `user.tenantId`, and stores it on `request.state.user`. Routes read it with:
```python
tenant_id = request.state.user.get("tenantId", DEFAULT_TENANT_ID)
```

---

## Consequences

**Good:**
- Tenant isolation is enforced at the DB engine level, independent of application code.
- A missing `WHERE tenant_id = …` clause in any query returns 0 rows instead of leaking data.
- Adding new tables only requires adding the policy + the `get_tenant_cursor()` call — no application-wide audit needed.

**Bad / trade-offs:**
- Every query requires `set_config` to be called first; forgetting it returns an empty result with no error, which can look like a bug.
- The `true` (transaction-local) scope means `set_config` must be repeated if a connection is reused across requests — the pool handles this because `get_tenant_cursor` is always called at the start of each request handler.
- Performance: the EXISTS subquery on child tables adds a join on every read. For very high-throughput scenarios this may need a covering index on `assessment_id`.

---

## Alternatives considered

| Option | Rejected because |
|--------|-----------------|
| Application-level `WHERE tenant_id = …` on every query | Easy to miss; no defence in depth |
| Separate PostgreSQL schema per tenant | Schema proliferation; complex migrations; not feasible at 100+ tenants |
| Separate database per tenant | Operational overhead; connection pool explosion |
| JWT claims checked in middleware only | Single point of failure; DB layer unprotected |
