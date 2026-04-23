import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { PROJECT_ACTIVE_LIMIT, validateProjectPatch } from "@/shared/models/projects";

export const runtime = "nodejs";

async function assertOwns(id: string, userId: string): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM vybe_projects WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
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

  const validation = validateProjectPatch(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const patch = validation.value;

  if (patch.archived === false) {
    const countRows = await queryInternalDatabase(
      `SELECT COUNT(*)::int AS n FROM vybe_projects WHERE user_email = $1 AND archived = FALSE AND id != $2`,
      [userId, id],
    );
    const count = countRows[0]?.n as number | undefined;
    if (count != null && count >= PROJECT_ACTIVE_LIMIT) {
      return NextResponse.json(
        { error: `Active project limit reached (${PROJECT_ACTIVE_LIMIT}).` },
        { status: 409 },
      );
    }
  }

  const fields: string[] = [];
  const values: (string | boolean | null)[] = [];
  const map: Record<string, string> = {
    name: "name",
    color: "color",
    description: "description",
    archived: "archived",
  };
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k];
    if (!col) continue;
    values.push(v as string | boolean | null);
    fields.push(`${col} = $${values.length}`);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(id);
  values.push(userId);
  await queryInternalDatabase(
    `UPDATE vybe_projects SET ${fields.join(", ")}, updated_at = NOW()
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
    `DELETE FROM vybe_projects WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}
