-- 008: Monthly per-user AI-usage counter for the free tier.
-- Incremented via ON CONFLICT (user_email, yyyymm) DO UPDATE so concurrent
-- increments are atomic. No row = 0 used.

CREATE TABLE IF NOT EXISTS vybe_ai_usage_counter (
  user_email TEXT        NOT NULL,
  yyyymm     TEXT        NOT NULL,
  count      INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email, yyyymm)
);

CREATE INDEX IF NOT EXISTS vybe_ai_usage_counter_user_idx
  ON vybe_ai_usage_counter (user_email);
