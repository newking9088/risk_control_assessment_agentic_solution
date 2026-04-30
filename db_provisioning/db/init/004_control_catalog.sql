-- ============================================================
-- 004_control_catalog.sql — Global control catalog (per tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS app.control_catalog (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    control_type    TEXT CHECK (control_type IN ('Preventive','Detective','Corrective','Directive')),
    is_key_control  BOOLEAN NOT NULL DEFAULT FALSE,
    source          TEXT,
    category        TEXT,
    tags            JSONB NOT NULL DEFAULT '[]',
    display_label   TEXT,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT control_catalog_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_control_catalog_tenant
    ON app.control_catalog (tenant_id);

ALTER TABLE app.control_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.control_catalog
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

GRANT ALL ON app.control_catalog TO authenticator;
