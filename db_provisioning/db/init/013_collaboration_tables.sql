-- 013_collaboration_tables.sql
-- Collaboration: collaborators, presence, notifications

CREATE TABLE IF NOT EXISTS app.assessment_collaborators (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        REFERENCES app.tenants(id),
    assessment_id UUID        REFERENCES app.assessments(id) ON DELETE CASCADE,
    user_id       TEXT        NOT NULL,
    user_email    TEXT,
    display_name  TEXT,
    role          TEXT        NOT NULL DEFAULT 'editor'
                              CHECK (role IN ('editor', 'reader')),
    invited_by    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, user_id)
);

CREATE INDEX IF NOT EXISTS collab_assessment_id ON app.assessment_collaborators (assessment_id);
CREATE INDEX IF NOT EXISTS collab_user_id ON app.assessment_collaborators (user_id);

-- Ephemeral presence — rows older than 5 min are stale and pruned on read
CREATE TABLE IF NOT EXISTS app.presence (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID        REFERENCES app.tenants(id),
    assessment_id  UUID        REFERENCES app.assessments(id) ON DELETE CASCADE,
    user_id        TEXT        NOT NULL,
    display_name   TEXT,
    role           TEXT        NOT NULL DEFAULT 'reader',
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, user_id)
);

CREATE TABLE IF NOT EXISTS app.notifications (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        REFERENCES app.tenants(id),
    user_id       TEXT        NOT NULL,
    type          TEXT        NOT NULL
                              CHECK (type IN ('collab_invite','session_updated','review_requested','review_approved','review_rejected')),
    body          TEXT,
    assessment_id UUID        REFERENCES app.assessments(id) ON DELETE SET NULL,
    actor_id      TEXT,
    actor_name    TEXT,
    read          BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created ON app.notifications (user_id, created_at DESC);
