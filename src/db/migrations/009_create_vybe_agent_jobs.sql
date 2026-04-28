-- 009: Agent job lifecycle + step ledger.
-- Jobs are queued by POST /api/agent/run and executed by an in-process
-- runner (wave 4A uses setImmediate; wave 4B may swap to a queue).

CREATE TABLE IF NOT EXISTS vybe_agent_jobs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT        NOT NULL,
  status     TEXT        NOT NULL
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  goal       TEXT        NOT NULL,
  context    JSONB       NULL,
  steps      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  output     JSONB       NULL,
  error      TEXT        NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_agent_jobs_user_created_idx
  ON vybe_agent_jobs (user_email, created_at DESC);
