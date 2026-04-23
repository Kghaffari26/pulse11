-- 004: vybe_project_files — attachments scoped to project (and optionally a task).
-- Note: task_id is TEXT (not UUID) because pulse_tasks.id is a TEXT
-- application-generated identifier. FK is preserved.
CREATE TABLE IF NOT EXISTS vybe_project_files (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES vybe_projects(id) ON DELETE CASCADE,
  task_id     TEXT        NULL     REFERENCES pulse_tasks(id)   ON DELETE SET NULL,
  user_email  TEXT        NOT NULL,
  filename    TEXT        NOT NULL,
  blob_url    TEXT        NOT NULL,
  size_bytes  BIGINT      NOT NULL,
  mime_type   TEXT        NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_project_files_project_idx ON vybe_project_files (project_id);
CREATE INDEX IF NOT EXISTS vybe_project_files_task_idx    ON vybe_project_files (task_id);
CREATE INDEX IF NOT EXISTS vybe_project_files_user_idx    ON vybe_project_files (user_email);
