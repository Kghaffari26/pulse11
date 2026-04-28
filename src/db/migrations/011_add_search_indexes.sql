-- 011: lowercase functional indexes powering Wave 4B-3 global search.
--
-- The /api/search endpoint runs LOWER(column) LIKE '%q%' against four
-- tables in parallel. Without these indexes Postgres seq-scans every row
-- on every query — fine at small scale but cheap to fix now.
--
-- pg_trgm / FTS / tsvector are intentionally NOT used; this migration is
-- the floor that lets us upgrade to those later without a schema rewrite.

CREATE INDEX IF NOT EXISTS vybe_projects_name_lower_idx
  ON vybe_projects (LOWER(name));

CREATE INDEX IF NOT EXISTS pulse_tasks_title_lower_idx
  ON pulse_tasks (LOWER(title));

CREATE INDEX IF NOT EXISTS vybe_project_notes_title_lower_idx
  ON vybe_project_notes (LOWER(title));

CREATE INDEX IF NOT EXISTS vybe_project_files_filename_lower_idx
  ON vybe_project_files (LOWER(filename));
