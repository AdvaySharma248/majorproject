-- Apply once before deploying the subject-column feature. No scores are changed.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'skill_taxonomy' AND column_name = 'default_visible') THEN
    ALTER TABLE skill_taxonomy ADD COLUMN default_visible BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE skill_taxonomy SET default_visible = TRUE
      WHERE domain_category::text IN ('Programming/DSA', 'Core Computer Science');
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subject_column_preferences JSONB NULL
  CHECK (subject_column_preferences IS NULL OR jsonb_typeof(subject_column_preferences) = 'object');
-- Abort safely if legacy records contain case-insensitive duplicates; never merge scores.
CREATE UNIQUE INDEX IF NOT EXISTS skill_name_normalized_unique ON skill_taxonomy (lower(btrim(skill_name)));
CREATE UNIQUE INDEX IF NOT EXISTS skill_code_normalized_unique ON skill_taxonomy (lower(btrim(skill_code)));
COMMIT;
