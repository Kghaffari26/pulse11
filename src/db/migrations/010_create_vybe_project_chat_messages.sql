-- 010: vybe_project_chat_messages — per-project AI chat history.
-- One conversation thread per project, persisted across sessions. Wave 4B-1.
-- context_used records which file IDs / note IDs were included as context for
-- a given assistant message, so the UI can display "Used N files, M notes"
-- without re-running the prompt.

CREATE TABLE IF NOT EXISTS vybe_project_chat_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES vybe_projects(id) ON DELETE CASCADE,
  user_email   TEXT        NOT NULL,
  role         TEXT        NOT NULL
    CHECK (role IN ('user', 'assistant', 'system')),
  content      TEXT        NOT NULL,
  context_used JSONB       NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_project_chat_messages_project_idx
  ON vybe_project_chat_messages (project_id, created_at);
