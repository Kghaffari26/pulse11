import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateNoteCreate, type Note } from "@/shared/models/notes";

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

async function assertProjectOwns(
  projectId: string,
  userId: string,
): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM vybe_projects WHERE id = $1 AND user_email = $2`,
    [projectId, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id: projectId } = await params;
  const own = await assertProjectOwns(projectId, userId);
  if (own) return own;

  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_project_notes WHERE project_id = $1 AND user_email = $2 ORDER BY updated_at DESC`,
    [projectId, userId],
  );
  return NextResponse.json(rows.map(rowToNote));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id: projectId } = await params;
  const own = await assertProjectOwns(projectId, userId);
  if (own) return own;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateNoteCreate(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { title, contentJson, contentMarkdown } = validation.value;

  const rows = await queryInternalDatabase(
    `INSERT INTO vybe_project_notes (project_id, user_email, title, content_json, content_markdown)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      projectId,
      userId,
      title ?? null,
      contentJson ? JSON.stringify(contentJson) : null,
      contentMarkdown ?? null,
    ],
  );
  return NextResponse.json(rowToNote(rows[0] as Record<string, unknown>));
}
