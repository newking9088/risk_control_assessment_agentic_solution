-- Permanent non-superuser role used by integration tests to verify RLS policies.
-- Uses SET LOCAL ROLE (no login needed).  Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rls_tester') THEN
    CREATE ROLE rls_tester NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO rls_tester;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO rls_tester;
