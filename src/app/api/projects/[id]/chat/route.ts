import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { defaultChatStore } from "@/server-lib/chat-store";
import { handleChatTurn } from "@/server-lib/chat-handler";
import type { ChatContextFile, ChatContextNote } from "@/server-lib/chat-context";
import {
  CHAT_PAGE_DEFAULT,
  CHAT_PAGE_MAX,
  validateChatMessage,
} from "@/shared/models/chat";

export const runtime = "nodejs";

async function assertProjectOwns(projectId: string, userId: string): Promise<NextResponse | null> {
  const rows = await queryInternalDatabase(
    `SELECT 1 FROM vybe_projects WHERE id = $1 AND user_email = $2`,
    [projectId, userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

async function loadFiles(projectId: string, userId: string): Promise<ChatContextFile[]> {
  const rows = await queryInternalDatabase(
    `SELECT id, filename, blob_url, mime_type, uploaded_at
     FROM vybe_project_files
     WHERE project_id = $1 AND user_email = $2
     ORDER BY uploaded_at DESC`,
    [projectId, userId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    filename: r.filename as string,
    blobUrl: r.blob_url as string,
    mimeType: (r.mime_type as string | null) ?? null,
    uploadedAt: new Date(r.uploaded_at as string).toISOString(),
  }));
}

async function loadNotes(projectId: string, userId: string): Promise<ChatContextNote[]> {
  const rows = await queryInternalDatabase(
    `SELECT id, title, content_markdown, updated_at
     FROM vybe_project_notes
     WHERE project_id = $1 AND user_email = $2
     ORDER BY updated_at DESC`,
    [projectId, userId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? null,
    contentMarkdown: (r.content_markdown as string | null) ?? null,
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }));
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

  const messageInput = (body as { message?: unknown })?.message;
  const validation = validateChatMessage(messageInput);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const result = await handleChatTurn({
    projectId,
    userId,
    message: validation.value,
    deps: { loadFiles, loadNotes },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        type: result.kind,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage,
    remainingFreeTier: result.remainingFreeTier,
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id: projectId } = await params;
  const own = await assertProjectOwns(projectId, userId);
  if (own) return own;

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const before = url.searchParams.get("before");

  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : CHAT_PAGE_DEFAULT;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(1, parsedLimit), CHAT_PAGE_MAX)
    : CHAT_PAGE_DEFAULT;

  const messages = await defaultChatStore.page({
    projectId,
    userEmail: userId,
    limit,
    before: before || null,
  });

  return NextResponse.json({ messages });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id: projectId } = await params;
  const own = await assertProjectOwns(projectId, userId);
  if (own) return own;

  const deleted = await defaultChatStore.clear(projectId, userId);
  return NextResponse.json({ deleted });
}
