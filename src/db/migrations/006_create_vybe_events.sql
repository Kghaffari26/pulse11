-- 006: Calendar events.
-- category_id is nullable and uses ON DELETE SET NULL, but the application
-- layer blocks silent category deletion (see VYBE-105) and forces the user
-- to reassign events first.

CREATE TABLE IF NOT EXISTS vybe_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT        NOT NULL,
  category_id UUID        NULL REFERENCES vybe_event_categories(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  description TEXT        NULL,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  all_day     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vybe_events_end_after_start CHECK (end_time >= start_time)
);

CREATE INDEX IF NOT EXISTS vybe_events_user_start_idx
  ON vybe_events (user_email, start_time);
