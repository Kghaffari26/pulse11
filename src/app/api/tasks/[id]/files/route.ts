import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import type { ProjectFile } from "@/shared/models/files";

export const runtime = "nodejs";

function rowToFile(row: Record<string, unknown>): ProjectFile {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    taskId: (row.task_id as string | null) ?? null,
    userEmail: row.user_email as string,
    filename: row.filename as string,
    blobUrl: row.blob_url as string,
    sizeBytes: Number(row.size_bytes),
    mimeType: (row.mime_type as string | null) ?? null,
    uploadedAt: new Date(row.uploaded_at as string).toISOString(),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id: taskId } = await params;

  // Ownership check via the task itself.
  const owns = await queryInternalDatabase(
    `SELECT 1 FROM pulse_tasks WHERE id = $1 AND user_email = $2`,
    [taskId, userId],
  );
  if (owns.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_project_files
     WHERE task_id = $1 AND user_email = $2
     ORDER BY uploaded_at DESC`,
    [taskId, userId],
  );
  return NextResponse.json(rows.map(rowToFile));
}
