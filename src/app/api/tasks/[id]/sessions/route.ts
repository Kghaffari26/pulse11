import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { generateSessions } from "@/shared/models/pulse";

function uid() {
  return `ses_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * POST /api/tasks/:id/sessions
 *
 * Two modes:
 * 1. Regenerate pending Pomodoro sessions for a task: pass { workBlock?, breakBlock? }.
 * 2. Log an ad-hoc completed session: pass { startedAt, durationMinutes, completed: true }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    workBlock?: number;
    breakBlock?: number;
    startedAt?: string;
    durationMinutes?: number;
    completed?: boolean;
  };

  const rows = await queryInternalDatabase(
    `SELECT * FROM pulse_tasks WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  const task = rows[0];
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mode 2: ad-hoc completed session
  if (body.completed && typeof body.durationMinutes === "number" && body.durationMinutes > 0) {
    const sessionId = uid();
    const startedAt = body.startedAt ?? new Date().toISOString();
    await queryInternalDatabase(
      `INSERT INTO pulse_sessions (id, task_id, start_at, duration_minutes, break_minutes, completed)
       VALUES ($1,$2,$3,$4,$5,TRUE)`,
      [sessionId, id, startedAt, Math.round(body.durationMinutes), 0],
    );
    await queryInternalDatabase(
      `UPDATE pulse_tasks SET completed_minutes = LEAST(estimated_minutes, completed_minutes + $1), updated_at = NOW() WHERE id = $2`,
      [Math.round(body.durationMinutes), id],
    );
    return NextResponse.json({ ok: true, id: sessionId });
  }

  // Mode 1: regenerate schedule
  const sessions = generateSessions(
    {
      id,
      estimatedMinutes: task.estimated_minutes as number,
      completedMinutes: task.completed_minutes as number,
      deadline: new Date(task.deadline as string).toISOString(),
    },
    { workBlock: body.workBlock, breakBlock: body.breakBlock },
  );

  await queryInternalDatabase(`DELETE FROM pulse_sessions WHERE task_id = $1 AND completed = FALSE`, [id]);
  for (const s of sessions) {
    await queryInternalDatabase(
      `INSERT INTO pulse_sessions (id, task_id, start_at, duration_minutes, break_minutes) VALUES ($1,$2,$3,$4,$5)`,
      [uid(), id, s.startAt.toISOString(), s.durationMinutes, s.breakMinutes],
    );
  }
  return NextResponse.json({ ok: true, count: sessions.length });
}
