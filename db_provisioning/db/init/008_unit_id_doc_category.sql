-- Migration 008: Add unit_id to assessments, category to assessment_documents

ALTER TABLE app.assessments
  ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT '';

ALTER TABLE app.assessment_documents
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'au_description';
