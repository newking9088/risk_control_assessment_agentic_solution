-- ============================================================
-- 007_risk_applicability.sql — Add applicability tracking
-- columns to assessment_risks for Step 3
-- ============================================================

ALTER TABLE app.assessment_risks
  ADD COLUMN IF NOT EXISTS applicability_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS confidence_label         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS decision_basis           VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS requires_review          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extra_data               JSONB   NOT NULL DEFAULT '{}';
