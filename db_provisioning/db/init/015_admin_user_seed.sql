-- ============================================================
-- 015_admin_user_seed.sql
--
-- 1. Expand auth."user".role CHECK to include all roles
-- 2. Seed a dev admin user in auth."user" + auth.account
-- 3. Mirror the user in app.users for the admin panel
--
-- Dev credentials:
--   Email    : admin@rca.local
--   Password : Admin@1234
-- ============================================================

-- ── 1. pgcrypto (needed for crypt / gen_salt) ─────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. Expand the role CHECK constraint ───────────────────────
-- Drop the old inline constraint (auto-named by Postgres) and
-- replace it with one that covers all six application roles.
DO $$
DECLARE
  _cname TEXT;
BEGIN
  SELECT conname INTO _cname
  FROM   pg_constraint
  WHERE  conrelid = 'auth."user"'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) LIKE '%role%';

  IF _cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE auth."user" DROP CONSTRAINT %I', _cname);
  END IF;
END $$;

ALTER TABLE auth."user"
  ADD CONSTRAINT user_role_check
  CHECK (role IN (
    'viewer', 'analyst', 'senior_analyst',
    'team_lead', 'delivery_lead', 'admin'
  ));

-- ── 3. Seed admin user (auth schema) ─────────────────────────
INSERT INTO auth."user"
  (id, name, email, "emailVerified", role, "tenantId", "createdAt", "updatedAt")
VALUES (
  'seed_admin_001',
  'Platform Admin',
  'admin@rca.local',
  TRUE,
  'admin',
  '00000000-0000-0000-0000-000000000001',
  NOW(), NOW()
)
ON CONFLICT (email) DO UPDATE
  SET role            = 'admin',
      "emailVerified" = TRUE,
      "updatedAt"     = NOW();

-- ── 4. Seed credential account with bcrypt password ──────────
INSERT INTO auth.account
  (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
VALUES (
  'seed_admin_account_001',
  'admin@rca.local',
  'credential',
  'seed_admin_001',
  crypt('Admin@1234', gen_salt('bf', 10)),
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Mirror in app.users (admin panel) ─────────────────────
INSERT INTO app.users
  (id, tenant_id, email, name, role, status)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  'admin@rca.local',
  'Platform Admin',
  'admin',
  'active'
)
ON CONFLICT (email) DO UPDATE
  SET role   = 'admin',
      name   = 'Platform Admin',
      status = 'active';
