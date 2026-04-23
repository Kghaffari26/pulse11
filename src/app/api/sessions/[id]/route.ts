import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const body = (await req.json()) as { completed?: boolean; addCompletedMinutes?: number; taskId?: string };

  // Verify session belongs to a task the user owns
  const owns = await queryInternalDatabase(
    `SELECT 1 FROM pulse_sessions s
       JOIN pulse_tasks t ON t.id = s.task_id
      WHERE s.id = $1 AND t.user_email = $2`,
    [id, userId],
  );
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.completed !== undefined) {
    await queryInternalDatabase(`UPDATE pulse_sessions SET completed = $1 WHERE id = $2`, [body.completed, id]);
  }
  if (body.addCompletedMinutes && body.taskId) {
    // Verify the taskId also belongs to user (defense in depth)
    await queryInternalDatabase(
      `UPDATE pulse_tasks SET completed_minutes = LEAST(estimated_minutes, completed_minutes + $1), updated_at = NOW()
        WHERE id = $2 AND user_email = $3`,
      [body.addCompletedMinutes, body.taskId, userId],
    );
  }
  return NextResponse.json({ ok: true });
}
