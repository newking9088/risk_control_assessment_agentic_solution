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
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            UUID NOT NULL REFERENCES app.tenants(id),
    title                TEXT NOT NULL,
    description          TEXT,
    scope                TEXT,
    assessment_date      DATE,
    owner                TEXT,
    business_unit        TEXT,
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','in_progress','review','complete','archived')),
    current_step         INT NOT NULL DEFAULT 1
                         CHECK (current_step BETWEEN 1 AND 7),
    questionnaire        JSONB NOT NULL DEFAULT '{}',
    questionnaire_notes  JSONB NOT NULL DEFAULT '{}',
    created_by           TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legal_hold           BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Assessment risks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessment_risks (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id        UUID NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    category             TEXT NOT NULL,
    source               TEXT NOT NULL CHECK (source IN ('EXT','INT')),
    description          TEXT,
    applicable           BOOLEAN,
    inherent_likelihood  TEXT CHECK (inherent_likelihood IN ('low','medium','high','critical')),
    inherent_impact      TEXT CHECK (inherent_impact     IN ('low','medium','high','critical')),
    residual_likelihood  TEXT CHECK (residual_likelihood IN ('low','medium','high','critical')),
    residual_impact      TEXT CHECK (residual_impact     IN ('low','medium','high','critical')),
    taxonomy_risk_id     TEXT,
    rationale            TEXT,
    approved_by          TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Assessment controls ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.assessment_controls (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id           UUID NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    risk_id                 UUID REFERENCES app.assessment_risks(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    control_ref             TEXT,
    type                    TEXT CHECK (type IN ('Preventive','Detective','Corrective','Directive')),
    is_key                  BOOLEAN NOT NULL DEFAULT FALSE,
    description             TEXT,
    design_effectiveness    INT CHECK (design_effectiveness    BETWEEN 1 AND 3),
    operating_effectiveness INT CHECK (operating_effectiveness BETWEEN 1 AND 3),
    overall_effectiveness   TEXT CHECK (overall_effectiveness IN
                              ('Effective','Moderately Effective','Ineffective')),
    rationale               TEXT,
    evidence_ref            TEXT,
    approved_by             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    uploaded_by     TEXT NOT NULL,
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
    requested_by    TEXT NOT NULL,
    approved_by     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.audit_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES app.tenants(id),
    user_id     TEXT,
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
ALTER TABLE app.assessments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_risks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_chunks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.wip_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.approval_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.taxonomy_schemas   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.assessments
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.assessment_chunks
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.audit_events
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.taxonomy_schemas
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation ON app.assessment_risks
    USING (EXISTS (
        SELECT 1 FROM app.assessments a
        WHERE a.id = assessment_risks.assessment_id
          AND a.tenant_id = current_setting('app.current_tenant_id', true)::UUID
    ));

CREATE POLICY tenant_isolation ON app.assessment_controls
    USING (EXISTS (
        SELECT 1 FROM app.assessments a
        WHERE a.id = assessment_controls.assessment_id
          AND a.tenant_id = current_setting('app.current_tenant_id', true)::UUID
    ));

CREATE POLICY tenant_isolation ON app.assessment_documents
    USING (EXISTS (
        SELECT 1 FROM app.assessments a
        WHERE a.id = assessment_documents.assessment_id
          AND a.tenant_id = current_setting('app.current_tenant_id', true)::UUID
    ));

CREATE POLICY tenant_isolation ON app.wip_sessions
    USING (EXISTS (
        SELECT 1 FROM app.assessments a
        WHERE a.id = wip_sessions.assessment_id
          AND a.tenant_id = current_setting('app.current_tenant_id', true)::UUID
    ));

CREATE POLICY tenant_isolation ON app.approval_requests
    USING (EXISTS (
        SELECT 1 FROM app.assessments a
        WHERE a.id = approval_requests.assessment_id
          AND a.tenant_id = current_setting('app.current_tenant_id', true)::UUID
    ));

-- ── Grants ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA app TO adminuser;
GRANT ALL ON ALL TABLES IN SCHEMA app TO adminuser;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO adminuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO adminuser;

-- ── Seed default tenant ───────────────────────────────────────
INSERT INTO app.tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default')
ON CONFLICT DO NOTHING;
