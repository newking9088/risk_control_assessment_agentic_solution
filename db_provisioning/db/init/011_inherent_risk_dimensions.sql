-- ============================================================
-- 011_inherent_risk_dimensions.sql — Per-dimension inherent
-- risk scoring (likelihood + 5 impact categories, 1-4 scale)
-- ============================================================

ALTER TABLE app.assessment_risks
  ADD COLUMN IF NOT EXISTS likelihood_score        SMALLINT CHECK (likelihood_score        BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS financial_impact        SMALLINT CHECK (financial_impact        BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS regulatory_impact       SMALLINT CHECK (regulatory_impact       BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS legal_impact            SMALLINT CHECK (legal_impact            BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS customer_impact         SMALLINT CHECK (customer_impact         BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS reputational_impact     SMALLINT CHECK (reputational_impact     BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS likelihood_rationale    TEXT,
  ADD COLUMN IF NOT EXISTS financial_rationale     TEXT,
  ADD COLUMN IF NOT EXISTS regulatory_rationale    TEXT,
  ADD COLUMN IF NOT EXISTS legal_rationale         TEXT,
  ADD COLUMN IF NOT EXISTS customer_rationale      TEXT,
  ADD COLUMN IF NOT EXISTS reputational_rationale  TEXT;
