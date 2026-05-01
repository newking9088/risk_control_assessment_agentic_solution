-- ============================================================
-- 009_rating_columns.sql — Risk rating + end date columns
-- ============================================================

ALTER TABLE app.assessments ADD COLUMN IF NOT EXISTS inherent_risk_rating        TEXT;
ALTER TABLE app.assessments ADD COLUMN IF NOT EXISTS controls_effectiveness_rating TEXT;
ALTER TABLE app.assessments ADD COLUMN IF NOT EXISTS residual_risk_rating         TEXT;
ALTER TABLE app.assessments ADD COLUMN IF NOT EXISTS assessment_end_date          DATE;
