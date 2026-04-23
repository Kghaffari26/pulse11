import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateSubtaskTitle } from "@/shared/models/pulse-validation";

function uid() {
  return `sub_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const owns = await queryInternalDatabase(
    `SELECT 1 FROM pulse_tasks WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { title } = (await req.json()) as { title: string };

  const validation = validateSubtaskTitle(title);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const posRows = await queryInternalDatabase(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM pulse_subtasks WHERE task_id = $1`,
    [id],
  );
  const first = posRows[0];
  const next = first ? (first.next as number) : 0;
  await queryInternalDatabase(
    `INSERT INTO pulse_subtasks (id, task_id, title, position) VALUES ($1,$2,$3,$4)`,
    [uid(), id, title.trim(), next],
  );
  return NextResponse.json({ ok: true });
}
