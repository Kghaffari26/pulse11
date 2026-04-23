import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateEventPatch } from "@/shared/models/calendar";

export const runtime = "nodejs";

async function loadOwned(id: string, userId: string) {
  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_events WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return rows[0] as Record<string, unknown> | undefined;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const existing = await loadOwned(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const v = validateEventPatch(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // Cross-field check: if only one of start/end is patched, compare to existing.
  const patch = v.value;
  const newStart = patch.startTime ?? (existing.start_time as string);
  const newEnd = patch.endTime ?? (existing.end_time as string);
  if (new Date(newEnd).getTime() < new Date(newStart).getTime()) {
    return NextResponse.json({ error: "endTime must be >= startTime" }, { status: 400 });
  }

  if (patch.categoryId) {
    const owned = await queryInternalDatabase(
      `SELECT 1 FROM vybe_event_categories WHERE id = $1 AND user_email = $2`,
      [patch.categoryId, userId],
    );
    if (owned.length === 0) {
      return NextResponse.json({ error: "categoryId not found" }, { status: 400 });
    }
  }

  const fields: string[] = [];
  const values: (string | boolean | null)[] = [];
  const map: Record<string, string> = {
    categoryId: "category_id",
    title: "title",
    description: "description",
    startTime: "start_time",
    endTime: "end_time",
    allDay: "all_day",
  };
  for (const [k, v2] of Object.entries(patch)) {
    const col = map[k];
    if (!col) continue;
    values.push(v2 as string | boolean | null);
    fields.push(`${col} = $${values.length}`);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });

  values.push(id);
  values.push(userId);
  await queryInternalDatabase(
    `UPDATE vybe_events SET ${fields.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND user_email = $${values.length}`,
    values,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  await queryInternalDatabase(
    `DELETE FROM vybe_events WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}
