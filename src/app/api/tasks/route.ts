import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import type { Task, TaskInput } from "@/shared/models/pulse";
import { validateTaskInput } from "@/shared/models/pulse-validation";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

async function hydrateTasks(rows: Record<string, unknown>[]): Promise<Task[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const subtasks = await queryInternalDatabase(
    `SELECT * FROM pulse_subtasks WHERE task_id = ANY($1::text[]) ORDER BY position ASC`,
    [ids],
  );
  const sessions = await queryInternalDatabase(
    `SELECT * FROM pulse_sessions WHERE task_id = ANY($1::text[]) ORDER BY start_at ASC`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.id as string,
    userEmail: r.user_email as string,
    title: r.title as string,
    category: r.category as Task["category"],
    deadline: new Date(r.deadline as string).toISOString(),
    estimatedMinutes: r.estimated_minutes as number,
    priority: r.priority as Task["priority"],
    mode: r.mode as Task["mode"],
    status: r.status as Task["status"],
    completedMinutes: r.completed_minutes as number,
    notes: (r.notes as string) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    subtasks: subtasks
      .filter((s) => s.task_id === r.id)
      .map((s) => ({
        id: s.id as string,
        taskId: s.task_id as string,
        title: s.title as string,
        done: s.done as boolean,
        position: s.position as number,
      })),
    sessions: sessions
      .filter((s) => s.task_id === r.id)
      .map((s) => ({
        id: s.id as string,
        taskId: s.task_id as string,
        startAt: new Date(s.start_at as string).toISOString(),
        durationMinutes: s.duration_minutes as number,
        breakMinutes: s.break_minutes as number,
        completed: s.completed as boolean,
      })),
  }));
}

export async function GET(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  let query: string;
  if (statusFilter === "archived") {
    // Archived list: only completed, reverse-chrono by completed_at.
    // NULLS LAST guards against any legacy 'done' rows without a completed_at.
    query = `SELECT * FROM pulse_tasks
             WHERE user_email = $1
               AND (status = 'completed' OR status = 'done')
             ORDER BY completed_at DESC NULLS LAST, updated_at DESC`;
  } else if (statusFilter === "active") {
    query = `SELECT * FROM pulse_tasks
             WHERE user_email = $1
               AND status <> 'completed' AND status <> 'done'
             ORDER BY deadline ASC`;
  } else {
    query = `SELECT * FROM pulse_tasks WHERE user_email = $1 ORDER BY deadline ASC`;
  }

  const rows = await queryInternalDatabase(query, [userId]);
  const tasks = await hydrateTasks(rows);
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const body = (await req.json()) as TaskInput;

  const validation = validateTaskInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const id = uid("task");
  await queryInternalDatabase(
    `INSERT INTO pulse_tasks (id, user_email, title, category, deadline, estimated_minutes, priority, mode, notes, project_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      userId,
      body.title.trim(),
      body.category,
      body.deadline,
      body.estimatedMinutes,
      body.priority,
      body.mode,
      body.notes ?? null,
      body.projectId ?? null,
    ],
  );

  if (body.subtasks && body.subtasks.length > 0) {
    for (let i = 0; i < body.subtasks.length; i++) {
      const t = body.subtasks[i];
      if (!t || !t.trim()) continue;
      await queryInternalDatabase(
        `INSERT INTO pulse_subtasks (id, task_id, title, position) VALUES ($1,$2,$3,$4)`,
        [uid("sub"), id, t.trim(), i],
      );
    }
  }

  const rows = await queryInternalDatabase(`SELECT * FROM pulse_tasks WHERE id = $1`, [id]);
  const [task] = await hydrateTasks(rows);
  return NextResponse.json(task);
}
