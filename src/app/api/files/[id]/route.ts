import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id } = await params;

  const rows = await queryInternalDatabase(
    `SELECT blob_url FROM vybe_project_files WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blobUrl = (rows[0] as Record<string, unknown>).blob_url as string;

  try {
    await del(blobUrl);
  } catch (err) {
    // If the blob is already gone, fall through and still remove the DB row.
    console.warn("[files] blob delete warning:", err instanceof Error ? err.message : err);
  }

  await queryInternalDatabase(
    `DELETE FROM vybe_project_files WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}
