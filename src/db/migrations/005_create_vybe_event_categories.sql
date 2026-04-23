-- 005: Event categories for the calendar system.
-- Default categories are NOT seeded here; the API seeds them per-user
-- on first GET inside a transaction (see src/app/api/event-categories/route.ts).

CREATE TABLE IF NOT EXISTS vybe_event_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL,
  is_default BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_event_categories_user_idx
  ON vybe_event_categories (user_email);
