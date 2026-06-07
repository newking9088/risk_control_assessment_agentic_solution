-- Ensure RLS is enforced even for the table owner (app user).
-- Required so that the connecting DB user cannot bypass tenant isolation
-- regardless of whether it owns the tables.
ALTER TABLE app.assessments           FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_risks      FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_controls   FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_documents  FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assessment_chunks     FORCE ROW LEVEL SECURITY;
ALTER TABLE app.wip_sessions          FORCE ROW LEVEL SECURITY;
ALTER TABLE app.approval_requests     FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events          FORCE ROW LEVEL SECURITY;
ALTER TABLE app.taxonomy_schemas      FORCE ROW LEVEL SECURITY;
