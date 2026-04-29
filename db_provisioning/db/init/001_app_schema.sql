-- ============================================================
-- 001_app_schema.sql — Core application schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS app;

-- ── Tenants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Assessments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES app.tenants(id),
    au_name     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress','complete','archived')),
    created_by  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legal_hold  BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Assessment risks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessment_risks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    risk_id         TEXT NOT NULL,
    applicable      BOOLEAN,
    rationale       TEXT,
    inherent_l      INT,
    inherent_i      INT,
    residual        INT,
    approved_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Assessment controls ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessment_controls (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    risk_id         UUID NOT NULL REFERENCES app.assessment_risks(id) ON DELETE CASCADE,
    control_id      TEXT NOT NULL,
    design_eff      TEXT,
    operating_eff   TEXT,
    evidence_ref    TEXT,
    approved_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessment_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    blob_key        TEXT NOT NULL,
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    chunk_count     INT NOT NULL DEFAULT 0,
    blob_size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_by     UUID NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Chunks (RAG) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessment_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES app.assessment_documents(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES app.tenants(id),
    content         TEXT NOT NULL,
    embedding       VECTOR(384),
    chunk_index     INT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON app.assessment_chunks(tenant_id);

-- ── WIP sessions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.wip_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    step            TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','reviewed','approved')),
    data            JSONB NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Approval requests ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.approval_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    step            TEXT NOT NULL,
    requested_by    UUID NOT NULL,
    approved_by     UUID,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.audit_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES app.tenants(id),
    user_id     UUID,
    event_type  TEXT NOT NULL,
    entity_id   UUID,
    prompt      TEXT,
    chunks      JSONB,
    model       TEXT,
    confidence  FLOAT,
    ip_address  TEXT,
    user_agent  TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Chat ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.chat_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content     TEXT NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.chat_telemetry (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL,
    model               TEXT,
    tokens_in           INT,
    tokens_out          INT,
    latency_ms          INT,
    retrieved_chunks    JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Taxonomy ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.taxonomy_schemas (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES app.tenants(id),
    name        TEXT NOT NULL,
    version     INT NOT NULL DEFAULT 1,
    schema      JSONB NOT NULL DEFAULT '{}',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE app.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.wip_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.taxonomy_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.assessments
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.assessment_chunks
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.audit_events
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.taxonomy_schemas
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Seed default tenant
INSERT INTO app.tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default')
ON CONFLICT DO NOTHING;
