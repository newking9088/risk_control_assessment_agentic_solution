-- ============================================================
-- 005_taxonomy_evolution.sql — Extend taxonomy_schemas with
-- risks_data, controls_data, upload tracking columns
-- ============================================================

ALTER TABLE app.taxonomy_schemas
  ADD COLUMN IF NOT EXISTS source_type    TEXT CHECK (source_type IN ('internal','external','both')) DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS risks_data     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS controls_data  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS risk_count     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS control_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_name      TEXT,
  ADD COLUMN IF NOT EXISTS file_sha256    TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Prevent duplicate file uploads within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomy_schema_unique_file_hash
  ON app.taxonomy_schemas (tenant_id, file_sha256)
  WHERE file_sha256 IS NOT NULL;
