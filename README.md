# Pulse — Personal Time Strategist

## High-level Strategy and Goal
Pulse is a modern productivity app that goes beyond to-do lists: it acts as a personal
time strategist. It ranks tasks by a dynamic **Urgency Score** derived from deadline
proximity, estimated completion time, and priority — then proactively tells the user
*when* to start, not just *what* to do.

## Changes Implemented
- **Urgency Engine** (`src/shared/models/pulse.ts`): pure function `computeUrgency` returning score (0-100), level (chill/early/soon/now/overdue), optimal start time, and behind-schedule flag. Priority-weighted (Low/Medium/High/Critical). Covered by Jest tests.
- **Focus Scheduling**: `generateSessions` splits work into Pomodoro-style blocks anchored to the optimal start time.
- **Dashboard (`/`)**: stats, "Critical Today" section, urgency-sorted task list, overload warning when work exceeds available runway.
- **Tasks (`/tasks`)**: search, category filter, sort (urgency/deadline/newest), active + completed tabs.
- **Focus (`/focus`)**: session planner + live Pomodoro timer with work/break phases and progress ring. Logs completed minutes back to the task.
- **Settings (`/settings`)**: student/work mode switch, aggressive-alerts toggle.
- **Smart Task Input**: title, category, priority, deadline, estimated time (h/m), inline subtask builder, notes.
- **Adaptive Notifications** (`PulseNotifier`): in-app toasts for Start-Now, Falling-Behind, Optimal-Start (earlier window if aggressive alerts enabled). Evaluated every 30s, one fire per state per task.
- **Student / Work mode**: persisted per user, filters dashboard content and tailors category defaults.
- **Hardening pass**: API input validation via `src/shared/models/pulse-validation.ts` (title/deadline/priority/category/estimatedMinutes checks), focus timer now tracks completed work seconds across phase transitions and falls back to `createSession` when no pre-generated session exists, dashboard overload math uses the true deadline window (no 7-day cap), Smart Import coerces invalid AI fields to safe defaults, Tasks page persists filters to `localStorage`, notifications respect a new `notificationsEnabled` preference and properly treat overdue (`!isFinite(ratio)`) as falling behind, and AI account IDs are centralized in `src/config/ai-accounts.ts`. API-client mutations now propagate errors to callers so UI can show failure toasts.

## Architecture and Technical Decisions
- **Storage**: Postgres (Neon) with tables `pulse_tasks`, `pulse_subtasks`, `pulse_sessions`, `pulse_user_prefs`.
- **API**: REST routes under `src/app/api/{tasks, subtasks, sessions, prefs}`.
- **Client**: SWR for data fetching with 30s auto-refresh (acts as real-time approximation since SSE/WebSockets aren't available on this platform).
- **Shared model**: Urgency math lives in `src/shared/models/pulse.ts` so both API and UI use the same logic, and it is trivially unit-testable (pure functions, deterministic `now` parameter).
- **Validation shared module**: `src/shared/models/pulse-validation.ts` provides `validateTaskInput`, `validateTaskPatch`, `validateSubtaskTitle`. Used by all write endpoints and unit-tested alongside the urgency engine.
- **Zero-estimate tasks**: `computeUrgency` now handles `estimatedMinutes === 0` by scoring purely on priority + proximity (ratio returned as `NaN`). Overdue tasks still return `ratio: Infinity` with a capped score of 100.
- **Auth**: Single-org tool; dev mode uses a placeholder email. All data scoped by `user_email`.

## Development

### Environment

Runtime env vars live in `.env.local` (gitignored). The minimum set is:

- `DATABASE_URL` — Neon Postgres connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth.
- `GOOGLE_GEMINI_API_KEY` and/or `OPENAI_API_KEY` — AI Assist / Smart Import providers.
- `BLOB_READ_WRITE_TOKEN` — required for file uploads (VYBE-603); the
  upload route returns a clean 502 with a pointer at this var if it's
  missing, so the UI doesn't silently fail.

### Database migrations

Migrations are plain `.sql` files under `src/db/migrations/`, numbered
with a leading `NNN_` prefix so they sort lexicographically (e.g.
`001_create_migrations_log.sql`, `002_task_unification.sql`). Applied
versions are tracked in the `migrations_log` table (`version TEXT
PRIMARY KEY`, `applied_at TIMESTAMPTZ DEFAULT NOW()`).

Apply pending migrations:

```sh
npm run db:migrate
```

What the runner (`src/db/migrate.ts`) does:

1. Loads `.env.local` — no shell `export` gymnastics needed.
2. Bootstraps `migrations_log` itself (`CREATE TABLE IF NOT EXISTS …`)
   so a fresh DB doesn't require a seed script.
3. `SELECT version FROM migrations_log` to find what's already applied.
4. Iterates `src/db/migrations/*.sql` in sorted order; for each
   unapplied file it runs `BEGIN` → the file's SQL → `INSERT INTO
   migrations_log` → `COMMIT`. Any failure triggers `ROLLBACK` and
   aborts the run — the failing migration's version is never recorded.
5. Idempotent — re-running with nothing to do prints `No pending
   migrations.` and exits cleanly.

Adding a new migration:

1. Create `src/db/migrations/NNN_short_description.sql` using the next
   number. Zero-pad so the list stays sortable.
2. Prefer idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF
   NOT EXISTS`, `DO $$ BEGIN IF NOT EXISTS (…) THEN …`). This keeps
   partial re-runs safe and makes it trivial to apply against an
   already-provisioned branch.
3. Run `npm run db:migrate`. The version recorded in `migrations_log`
   is the filename minus `.sql`.

Rolling back is not automated — write a forward migration that undoes
the change.

### Tests

```sh
npm test            # jest (unit + model + migrate runner)
npm run build       # next build — also type-checks the whole app
```