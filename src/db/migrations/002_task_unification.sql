-- 002: Task unification — projects, FK, vybe_project_tasks view + INSTEAD OF triggers.

-- pulse_tasks augmentation
ALTER TABLE pulse_tasks ADD COLUMN IF NOT EXISTS project_id    UUID        NULL;
ALTER TABLE pulse_tasks ADD COLUMN IF NOT EXISTS description   TEXT        NULL;
ALTER TABLE pulse_tasks ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ NULL;

-- vybe_projects
CREATE TABLE IF NOT EXISTS vybe_projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  color       TEXT        NULL,
  description TEXT        NULL,
  archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_projects_user_idx
  ON vybe_projects (user_email, archived);

-- FK: pulse_tasks.project_id -> vybe_projects(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'pulse_tasks_project_id_fk'
      AND table_name = 'pulse_tasks'
  ) THEN
    ALTER TABLE pulse_tasks
      ADD CONSTRAINT pulse_tasks_project_id_fk
      FOREIGN KEY (project_id) REFERENCES vybe_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Unified view: exposes both Pulse columns and Vybe aliases.
CREATE OR REPLACE VIEW vybe_project_tasks AS
SELECT
  id,
  user_email,
  project_id,
  title,
  description,
  category,
  priority,
  mode,
  status,
  notes,
  deadline,
  deadline               AS due_date,
  estimated_minutes,
  completed_minutes,
  (status = 'completed') AS completed,
  completed_at,
  created_at,
  updated_at
FROM pulse_tasks;

-- INSTEAD OF INSERT: writes new row to pulse_tasks, reconciling
-- deadline/due_date and status/completed aliases.
CREATE OR REPLACE FUNCTION vybe_project_tasks_insert_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pulse_tasks (
    id, user_email, project_id, title, description, category, priority, mode,
    status, notes, deadline, estimated_minutes, completed_minutes, completed_at
  ) VALUES (
    NEW.id,
    NEW.user_email,
    NEW.project_id,
    NEW.title,
    NEW.description,
    NEW.category,
    NEW.priority,
    NEW.mode,
    COALESCE(
      NEW.status,
      CASE WHEN NEW.completed IS TRUE THEN 'completed' ELSE NULL END,
      'pending'
    ),
    NEW.notes,
    COALESCE(NEW.deadline, NEW.due_date),
    COALESCE(NEW.estimated_minutes, 0),
    COALESCE(NEW.completed_minutes, 0),
    CASE
      WHEN NEW.completed_at IS NOT NULL THEN NEW.completed_at
      WHEN NEW.completed IS TRUE THEN NOW()
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vybe_project_tasks_ins ON vybe_project_tasks;
CREATE TRIGGER vybe_project_tasks_ins
  INSTEAD OF INSERT ON vybe_project_tasks
  FOR EACH ROW EXECUTE FUNCTION vybe_project_tasks_insert_fn();

-- INSTEAD OF UPDATE: if `completed` flipped, derive status from it;
-- otherwise trust NEW.status. completed_at tracks completion transitions.
CREATE OR REPLACE FUNCTION vybe_project_tasks_update_fn()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pulse_tasks SET
    project_id        = NEW.project_id,
    title             = NEW.title,
    description       = NEW.description,
    category          = NEW.category,
    priority          = NEW.priority,
    mode              = NEW.mode,
    status            = CASE
                          WHEN NEW.completed IS DISTINCT FROM OLD.completed
                            THEN CASE WHEN NEW.completed THEN 'completed' ELSE 'pending' END
                          ELSE NEW.status
                        END,
    notes             = NEW.notes,
    deadline          = COALESCE(NEW.deadline, NEW.due_date),
    estimated_minutes = NEW.estimated_minutes,
    completed_minutes = NEW.completed_minutes,
    completed_at      = CASE
                          WHEN NEW.completed IS TRUE  AND OLD.completed IS NOT TRUE THEN NOW()
                          WHEN NEW.completed IS FALSE AND OLD.completed IS TRUE     THEN NULL
                          ELSE NEW.completed_at
                        END,
    updated_at        = NOW()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vybe_project_tasks_upd ON vybe_project_tasks;
CREATE TRIGGER vybe_project_tasks_upd
  INSTEAD OF UPDATE ON vybe_project_tasks
  FOR EACH ROW EXECUTE FUNCTION vybe_project_tasks_update_fn();

-- INSTEAD OF DELETE: pass through to pulse_tasks.
CREATE OR REPLACE FUNCTION vybe_project_tasks_delete_fn()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM pulse_tasks WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vybe_project_tasks_del ON vybe_project_tasks;
CREATE TRIGGER vybe_project_tasks_del
  INSTEAD OF DELETE ON vybe_project_tasks
  FOR EACH ROW EXECUTE FUNCTION vybe_project_tasks_delete_fn();
