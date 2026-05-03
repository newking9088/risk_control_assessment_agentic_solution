-- 012_admin_tables.sql
-- Admin panel tables: users, role_configs, audit_logs, approvals

CREATE TABLE IF NOT EXISTS app.users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        REFERENCES app.tenants(id),
    email         TEXT        NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'viewer'
                              CHECK (role IN ('viewer','analyst','senior_analyst','team_lead','delivery_lead','admin')),
    status        TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','inactive')),
    password_hash TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app.role_configs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        REFERENCES app.tenants(id),
    role            TEXT        NOT NULL,
    display_label   TEXT        NOT NULL,
    hierarchy_level INT         NOT NULL DEFAULT 1,
    capabilities    JSONB       NOT NULL DEFAULT '[]',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, role)
);

CREATE TABLE IF NOT EXISTS app.audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        REFERENCES app.tenants(id),
    event_type  TEXT        NOT NULL,
    actor_id    UUID,
    actor_name  TEXT,
    entity_type TEXT,
    entity_id   TEXT,
    detail      JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_created
    ON app.audit_logs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.approvals (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        REFERENCES app.tenants(id),
    assessment_id UUID        REFERENCES app.assessments(id),
    type          TEXT        NOT NULL,
    scope         TEXT,
    requested_by  UUID,
    reason        TEXT,
    status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected','expired')),
    review_note   TEXT,
    reviewed_by   UUID,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at   TIMESTAMPTZ
);

-- Seed default role configs for the default tenant
INSERT INTO app.role_configs (tenant_id, role, display_label, hierarchy_level, capabilities)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'viewer',
   'Viewer', 1,
   '["view_assessments"]'),
  ('00000000-0000-0000-0000-000000000001', 'analyst',
   'Analyst', 2,
   '["view_assessments","create_edit"]'),
  ('00000000-0000-0000-0000-000000000001', 'senior_analyst',
   'Senior Analyst', 3,
   '["view_assessments","create_edit"]'),
  ('00000000-0000-0000-0000-000000000001', 'team_lead',
   'Team Lead', 4,
   '["view_assessments","create_edit","upload_taxonomies"]'),
  ('00000000-0000-0000-0000-000000000001', 'delivery_lead',
   'Delivery Lead', 5,
   '["view_assessments","create_edit","delete_assessments","manage_taxonomies","upload_taxonomies","configure_llm","clear_cache","view_audit_logs","manage_users"]'),
  ('00000000-0000-0000-0000-000000000001', 'admin',
   'Admin', 6,
   '["view_assessments","create_edit","delete_assessments","manage_taxonomies","upload_taxonomies","configure_llm","clear_cache","view_audit_logs","manage_users"]')
ON CONFLICT (tenant_id, role) DO NOTHING;
