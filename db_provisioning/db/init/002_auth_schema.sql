-- ============================================================
-- 002_auth_schema.sql — Better Auth schema
-- ALL multi-word columns use double-quoted camelCase to match
-- what Better Auth writes. Single-word columns are unquoted.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth."user" (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    email            TEXT NOT NULL UNIQUE,
    "emailVerified"  BOOLEAN NOT NULL DEFAULT FALSE,
    image            TEXT,
    role             TEXT NOT NULL DEFAULT 'analyst'
                     CHECK (role IN ('viewer','analyst','delivery_lead')),
    "tenantId"       TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.session (
    id           TEXT PRIMARY KEY,
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    token        TEXT NOT NULL UNIQUE,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ipAddress"  TEXT,
    "userAgent"  TEXT,
    "userId"     TEXT NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.account (
    id                       TEXT PRIMARY KEY,
    "accountId"              TEXT NOT NULL,
    "providerId"             TEXT NOT NULL,
    "userId"                 TEXT NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
    "accessToken"            TEXT,
    "refreshToken"           TEXT,
    "idToken"                TEXT,
    "accessTokenExpiresAt"   TIMESTAMPTZ,
    "refreshTokenExpiresAt"  TIMESTAMPTZ,
    scope                    TEXT,
    password                 TEXT,
    "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.verification (
    id           TEXT PRIMARY KEY,
    identifier   TEXT NOT NULL,
    value        TEXT NOT NULL UNIQUE,
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_user  ON auth.session("userId");
CREATE INDEX IF NOT EXISTS idx_account_user  ON auth.account("userId");

-- ── Grants ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA auth TO adminuser;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO adminuser;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO adminuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO adminuser;
