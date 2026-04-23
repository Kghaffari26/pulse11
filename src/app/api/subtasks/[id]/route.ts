import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateSubtaskTitle } from "@/shared/models/pulse-validation";

async function assertOwns(subtaskId: string, userId: string): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM pulse_subtasks s
       JOIN pulse_tasks t ON t.id = s.task_id
      WHERE s.id = $1 AND t.user_email = $2`,
    [subtaskId, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const ownershipCheck = await assertOwns(id, userId);
  if (ownershipCheck) return ownershipCheck;

  const { done, title } = (await req.json()) as { done?: boolean; title?: string };
  if (title !== undefined) {
    const validation = validateSubtaskTitle(title);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }
  if (done !== undefined) {
    await queryInternalDatabase(`UPDATE pulse_subtasks SET done = $1 WHERE id = $2`, [done, id]);
  }
  if (title !== undefined) {
    await queryInternalDatabase(`UPDATE pulse_subtasks SET title = $1 WHERE id = $2`, [title.trim(), id]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const ownershipCheck = await assertOwns(id, userId);
  if (ownershipCheck) return ownershipCheck;

  await queryInternalDatabase(`DELETE FROM pulse_subtasks WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
