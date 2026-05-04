-- Step 1 & 2 backend: document chunks, AO snapshots, QA profiles

-- Text chunks extracted from uploaded assessment documents
CREATE TABLE IF NOT EXISTS app.document_chunks (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID        NOT NULL REFERENCES app.assessments(id) ON DELETE CASCADE,
    document_id   UUID        NOT NULL REFERENCES app.assessment_documents(id) ON DELETE CASCADE,
    tenant_id     UUID        NOT NULL,
    chunk_index   INTEGER     NOT NULL,
    category      TEXT        NOT NULL DEFAULT 'ao_details',
    content       TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_assessment_cat
    ON app.document_chunks(assessment_id, category, chunk_index);

-- AI-generated overview + operational profile + fraud surface per assessment
CREATE TABLE IF NOT EXISTS app.ao_snapshots (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id       UUID        NOT NULL UNIQUE REFERENCES app.assessments(id) ON DELETE CASCADE,
    tenant_id           UUID        NOT NULL,
    snapshot_version    TEXT        NOT NULL DEFAULT '1.0',
    ao_summary          TEXT        NOT NULL DEFAULT '',
    ao_display          JSONB       NOT NULL DEFAULT '{}',
    operational_profile JSONB       NOT NULL DEFAULT '{}',
    fraud_surface       JSONB       NOT NULL DEFAULT '{}',
    user_edited         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI-generated questionnaire answers per assessment
CREATE TABLE IF NOT EXISTS app.qa_profiles (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id         UUID        NOT NULL UNIQUE REFERENCES app.assessments(id) ON DELETE CASCADE,
    tenant_id             UUID        NOT NULL,
    mandatory_responses   JSONB       NOT NULL DEFAULT '[]',
    situational_responses JSONB       NOT NULL DEFAULT '[]',
    exposure_categories   JSONB       NOT NULL DEFAULT '{}',
    counters              JSONB       NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
