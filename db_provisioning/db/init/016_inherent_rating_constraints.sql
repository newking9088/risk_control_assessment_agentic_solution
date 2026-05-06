-- ============================================================
-- 016_inherent_rating_constraints.sql
-- Drop the restrictive low/medium/high/critical CHECK constraints
-- on likelihood/impact columns so FRA-style labels can be stored.
-- ============================================================

ALTER TABLE app.assessment_risks
  DROP CONSTRAINT IF EXISTS assessment_risks_inherent_likelihood_check,
  DROP CONSTRAINT IF EXISTS assessment_risks_inherent_impact_check,
  DROP CONSTRAINT IF EXISTS assessment_risks_residual_likelihood_check,
  DROP CONSTRAINT IF EXISTS assessment_risks_residual_impact_check;
