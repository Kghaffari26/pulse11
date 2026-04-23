import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import {
  quotaError,
  validateFileSize,
  willExceedQuota,
  type ProjectFile,
} from "@/shared/models/files";

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

async function assertProjectOwns(projectId: string, userId: string): Promise<NextResponse | null> {
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
    `SELECT * FROM vybe_project_files
     WHERE project_id = $1 AND user_email = $2
     ORDER BY uploaded_at DESC`,
    [projectId, userId],
  );

  const totalRows = await queryInternalDatabase(
    `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total
     FROM vybe_project_files WHERE user_email = $1`,
    [userId],
  );
  const totalBytes = Number((totalRows[0] as { total?: string | number } | undefined)?.total ?? 0);

  return NextResponse.json({
    files: rows.map(rowToFile),
    usage: { totalBytes },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id: projectId } = await params;
  const own = await assertProjectOwns(projectId, userId);
  if (own) return own;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const taskId = form.get("taskId");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  const sizeErr = validateFileSize(file.size);
  if (sizeErr) return NextResponse.json({ error: sizeErr }, { status: 413 });

  const totalRows = await queryInternalDatabase(
    `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total
     FROM vybe_project_files WHERE user_email = $1`,
    [userId],
  );
  const currentTotal = Number((totalRows[0] as { total?: string | number } | undefined)?.total ?? 0);
  if (willExceedQuota(currentTotal, file.size)) {
    return NextResponse.json({ error: quotaError(currentTotal) }, { status: 413 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const pathname = `projects/${projectId}/${Date.now()}-${safeName}`;

  let blobUrl: string;
  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type || undefined,
    });
    blobUrl = blob.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Blob upload failed";
    return NextResponse.json(
      { error: `Upload failed: ${msg}. Ensure BLOB_READ_WRITE_TOKEN is set.` },
      { status: 502 },
    );
  }

  const rows = await queryInternalDatabase(
    `INSERT INTO vybe_project_files
       (project_id, task_id, user_email, filename, blob_url, size_bytes, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      projectId,
      typeof taskId === "string" && taskId ? taskId : null,
      userId,
      file.name,
      blobUrl,
      file.size,
      file.type || null,
    ],
  );

  return NextResponse.json(rowToFile(rows[0] as Record<string, unknown>));
}
