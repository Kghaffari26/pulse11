import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import {
  PROJECT_ACTIVE_LIMIT,
  validateProjectInput,
  type Project,
} from "@/shared/models/projects";

export const runtime = "nodejs";

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    userEmail: row.user_email as string,
    name: row.name as string,
    color: (row.color as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    archived: Boolean(row.archived),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function GET(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const url = new URL(req.url);
  const archivedParam = url.searchParams.get("archived");
  const includeArchived = archivedParam === "1" || archivedParam === "true";

  const rows = await queryInternalDatabase(
    includeArchived
      ? `SELECT * FROM vybe_projects WHERE user_email = $1 ORDER BY archived ASC, created_at DESC`
      : `SELECT * FROM vybe_projects WHERE user_email = $1 AND archived = FALSE ORDER BY created_at DESC`,
    [userId],
  );
  return NextResponse.json(rows.map(rowToProject));
}

export async function POST(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateProjectInput(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  // Enforce active-project cap.
  const countRows = await queryInternalDatabase(
    `SELECT COUNT(*)::int AS n FROM vybe_projects WHERE user_email = $1 AND archived = FALSE`,
    [userId],
  );
  const count = countRows[0]?.n as number | undefined;
  if (count != null && count >= PROJECT_ACTIVE_LIMIT) {
    return NextResponse.json(
      { error: `Active project limit reached (${PROJECT_ACTIVE_LIMIT}). Archive one first.` },
      { status: 409 },
    );
  }

  const { name, color, description } = validation.value;
  const rows = await queryInternalDatabase(
    `INSERT INTO vybe_projects (user_email, name, color, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, name, color ?? null, description ?? null],
  );
  return NextResponse.json(rowToProject(rows[0] as Record<string, unknown>));
}
