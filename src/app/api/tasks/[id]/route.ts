import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateTaskPatch } from "@/shared/models/pulse-validation";

async function assertOwns(taskId: string, userId: string): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM pulse_tasks WHERE id = $1 AND user_email = $2`,
    [taskId, userId],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const ownershipCheck = await assertOwns(id, userId);
  if (ownershipCheck) return ownershipCheck;

  const body = (await req.json()) as Record<string, unknown>;

  const validation = validateTaskPatch(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const fields: string[] = [];
  const values: (string | number | boolean | Date | null)[] = [];
  const map: Record<string, string> = {
    title: "title",
    category: "category",
    deadline: "deadline",
    estimatedMinutes: "estimated_minutes",
    priority: "priority",
    mode: "mode",
    status: "status",
    completedMinutes: "completed_minutes",
    notes: "notes",
    projectId: "project_id",
    description: "description",
  };
  for (const [k, v] of Object.entries(body)) {
    const col = map[k];
    if (!col) continue;
    const value = k === "title" && typeof v === "string" ? v.trim() : v;
    values.push(value as string | number | boolean | Date | null);
    fields.push(`${col} = $${values.length}`);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(id);
  values.push(userId);
  await queryInternalDatabase(
    `UPDATE pulse_tasks SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length - 1} AND user_email = $${values.length}`,
    values,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  await queryInternalDatabase(`DELETE FROM pulse_tasks WHERE id = $1 AND user_email = $2`, [id, userId]);
  return NextResponse.json({ ok: true });
}
