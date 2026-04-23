import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";

export const runtime = "nodejs";

async function assertOwns(id: string, userId: string): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM pulse_tasks WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

// POST marks the task completed via the unified view — the INSTEAD OF
// UPDATE trigger sets status='completed' and completed_at=NOW() atomically.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id } = await params;

  const own = await assertOwns(id, userId);
  if (own) return own;

  await queryInternalDatabase(
    `UPDATE vybe_project_tasks SET completed = TRUE WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}

// DELETE clears completion (undo). The trigger nulls completed_at.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id } = await params;

  const own = await assertOwns(id, userId);
  if (own) return own;

  await queryInternalDatabase(
    `UPDATE vybe_project_tasks SET completed = FALSE WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}
