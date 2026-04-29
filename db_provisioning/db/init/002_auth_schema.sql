-- ============================================================
-- 002_auth_schema.sql — Better Auth schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth."user" (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    image           TEXT,
    role            TEXT NOT NULL DEFAULT 'analyst'
                    CHECK (role IN ('viewer','analyst','delivery_lead')),
    locked          BOOLEAN NOT NULL DEFAULT FALSE,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.session (
    id          TEXT PRIMARY KEY,
    expires_at  TIMESTAMPTZ NOT NULL,
    token       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address  TEXT,
    user_agent  TEXT,
    user_id     TEXT NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.account (
    id                      TEXT PRIMARY KEY,
    account_id              TEXT NOT NULL,
    provider_id             TEXT NOT NULL,
    user_id                 TEXT NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
    access_token            TEXT,
    refresh_token           TEXT,
    id_token                TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    scope                   TEXT,
    password                TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.verification (
    id          TEXT PRIMARY KEY,
    identifier  TEXT NOT NULL,
    value       TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_user ON auth.session(user_id);
CREATE INDEX IF NOT EXISTS idx_account_user ON auth.account(user_id);
