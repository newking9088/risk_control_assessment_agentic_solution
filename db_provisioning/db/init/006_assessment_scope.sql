-- ============================================================
-- 006_assessment_scope.sql — Add taxonomy_scope and risk_sources
-- columns to assessments for Step 1 scope selection
-- ============================================================

ALTER TABLE app.assessments
  ADD COLUMN IF NOT EXISTS taxonomy_scope TEXT NOT NULL DEFAULT 'both'
    CHECK (taxonomy_scope IN ('internal', 'external', 'both')),
  ADD COLUMN IF NOT EXISTS risk_sources JSONB NOT NULL DEFAULT '[]';
