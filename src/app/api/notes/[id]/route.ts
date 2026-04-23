import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateNotePatch, type Note } from "@/shared/models/notes";

export const runtime = "nodejs";

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userEmail: row.user_email as string,
    title: (row.title as string | null) ?? null,
    contentJson: (row.content_json as Record<string, unknown> | null) ?? null,
    contentMarkdown: (row.content_markdown as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

async function assertOwns(id: string, userId: string): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM vybe_project_notes WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id } = await params;

  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_project_notes WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rowToNote(rows[0] as Record<string, unknown>));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id } = await params;

  const own = await assertOwns(id, userId);
  if (own) return own;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateNotePatch(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const patch = validation.value;

  const fields: string[] = [];
  const values: (string | null)[] = [];
  const map: Record<string, { col: string; cast?: "json" }> = {
    title: { col: "title" },
    contentJson: { col: "content_json", cast: "json" },
    contentMarkdown: { col: "content_markdown" },
  };
  for (const [k, v] of Object.entries(patch)) {
    const spec = map[k];
    if (!spec) continue;
    if (spec.cast === "json") {
      values.push(v == null ? null : JSON.stringify(v));
      fields.push(`${spec.col} = $${values.length}::jsonb`);
    } else {
      values.push(v as string | null);
      fields.push(`${spec.col} = $${values.length}`);
    }
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(id);
  values.push(userId);
  await queryInternalDatabase(
    `UPDATE vybe_project_notes SET ${fields.join(", ")}, updated_at = NOW()
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
    `DELETE FROM vybe_project_notes WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}
