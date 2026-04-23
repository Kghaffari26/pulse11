import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { deleteCategoryWithReassign } from "@/server-lib/calendar-db";
import { validateCategoryPatch } from "@/shared/models/calendar";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;

  const existing = await queryInternalDatabase(
    `SELECT * FROM vybe_event_categories WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const v = validateCategoryPatch(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const fields: string[] = [];
  const values: (string | null)[] = [];
  if (v.value.name !== undefined) {
    values.push(v.value.name);
    fields.push(`name = $${values.length}`);
  }
  if (v.value.color !== undefined) {
    values.push(v.value.color);
    fields.push(`color = $${values.length}`);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });

  values.push(id);
  values.push(userId);
  await queryInternalDatabase(
    `UPDATE vybe_event_categories SET ${fields.join(", ")}
     WHERE id = $${values.length - 1} AND user_email = $${values.length}`,
    values,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const url = new URL(req.url);
  const hasReassignParam = url.searchParams.has("reassignTo");
  const reassignTo = hasReassignParam ? url.searchParams.get("reassignTo") : undefined;

  const result = await deleteCategoryWithReassign(userId, id, reassignTo, {
    query: (text, params) => queryInternalDatabase(text, (params ?? []) as never[]),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
