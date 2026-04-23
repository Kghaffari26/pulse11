-- Canonical definition of the migrations bookkeeping table.
-- The runner bootstraps this with IF NOT EXISTS so applying 001
-- on a fresh or partially-provisioned DB is always a no-op.
CREATE TABLE IF NOT EXISTS migrations_log (
  version    TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
