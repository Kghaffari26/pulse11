-- 003: vybe_project_notes — per-project notes with parallel JSON + markdown content.
CREATE TABLE IF NOT EXISTS vybe_project_notes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES vybe_projects(id) ON DELETE CASCADE,
  user_email       TEXT        NOT NULL,
  title            TEXT        NULL,
  content_json     JSONB       NULL,
  content_markdown TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_project_notes_project_idx ON vybe_project_notes (project_id);
CREATE INDEX IF NOT EXISTS vybe_project_notes_user_idx    ON vybe_project_notes (user_email);
