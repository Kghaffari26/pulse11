import {
  CHAT_CONTEXT_MAX_CHARS,
  type ChatContextUsed,
  type ChatMessage,
} from "@/shared/models/chat";
import { extractText, ExtractionError, type ExtractionDeps } from "./file-text-extractor";

export interface ChatContextFile {
  id: string;
  filename: string;
  blobUrl: string;
  mimeType: string | null;
  uploadedAt: string;
}

export interface ChatContextNote {
  id: string;
  title: string | null;
  contentMarkdown: string | null;
  updatedAt: string;
}

export interface BuiltContext {
  contextBlock: string;
  used: ChatContextUsed;
}

interface RenderedItem {
  id: string;
  kind: "file" | "note";
  rendered: string;
  ts: number;
  meta: { filename?: string; title?: string | null; truncated?: boolean };
}

const NOTE_HEADER = (title: string | null) => `=== Note: ${title?.trim() || "(untitled)"} ===`;
const FILE_HEADER = (filename: string) => `=== File: ${filename} ===`;

/**
 * Build the project-context block sent to the AI alongside the user's message.
 *
 * Strategy:
 *   1. Render every file (via text extraction) and every note as a labeled block.
 *   2. Files that fail extraction are skipped with a warning (caller can inspect logs).
 *   3. All renderable items are sorted by recency (newest first by uploadedAt /
 *      updatedAt) and included greedily until CHAT_CONTEXT_MAX_CHARS is hit.
 *   4. The set of items that made it in is returned via `used` so the assistant
 *      message row can record exactly what was visible to the model.
 *
 * Per-file text is already capped at MAX_EXTRACTED_CHARS by the extractor, so a
 * single huge file can never crowd out everything else.
 */
export async function buildChatContext(
  files: ChatContextFile[],
  notes: ChatContextNote[],
  deps: { extract?: typeof extractText; extractionDeps?: ExtractionDeps; logWarn?: (msg: string) => void } = {},
): Promise<BuiltContext> {
  const extract = deps.extract ?? extractText;
  const logWarn = deps.logWarn ?? ((m) => console.warn(m));

  // Files: extract text in parallel; collect successful renderings.
  const fileResults = await Promise.all(
    files.map(async (f): Promise<RenderedItem | null> => {
      if (!f.mimeType) {
        logWarn(`[chat-context] skipping ${f.filename}: missing mime type`);
        return null;
      }
      try {
        const result = await extract(f.blobUrl, f.mimeType, f.filename, deps.extractionDeps);
        const body = result.truncated ? `${result.text}\n[...truncated]` : result.text;
        return {
          id: f.id,
          kind: "file",
          rendered: `${FILE_HEADER(f.filename)}\n${body}`,
          ts: new Date(f.uploadedAt).getTime(),
          meta: { filename: f.filename, truncated: result.truncated },
        };
      } catch (err) {
        const reason = err instanceof ExtractionError ? err.reason : (err as Error).message;
        logWarn(`[chat-context] skipping ${f.filename}: ${reason}`);
        return null;
      }
    }),
  );

  const noteResults: RenderedItem[] = notes
    .filter((n) => (n.contentMarkdown ?? "").trim().length > 0)
    .map((n) => ({
      id: n.id,
      kind: "note",
      rendered: `${NOTE_HEADER(n.title)}\n${n.contentMarkdown}`,
      ts: new Date(n.updatedAt).getTime(),
      meta: { title: n.title },
    }));

  const all: RenderedItem[] = [
    ...fileResults.filter((r): r is RenderedItem => r !== null),
    ...noteResults,
  ];

  // Newest first.
  all.sort((a, b) => b.ts - a.ts);

  const included: RenderedItem[] = [];
  let total = 0;
  for (const item of all) {
    // +2 accounts for the "\n\n" separator we'll inject between blocks.
    const cost = item.rendered.length + 2;
    if (total + cost > CHAT_CONTEXT_MAX_CHARS) continue;
    included.push(item);
    total += cost;
  }

  // Re-sort included items oldest-first inside the prompt so they read in a
  // natural chronological order; the recency sort above is purely for the
  // truncation decision.
  included.sort((a, b) => a.ts - b.ts);

  const contextBlock =
    included.length === 0
      ? "(No files or notes attached to this project yet.)"
      : included.map((i) => i.rendered).join("\n\n");

  const used: ChatContextUsed = {
    files: included
      .filter((i) => i.kind === "file")
      .map((i) => ({
        id: i.id,
        filename: i.meta.filename ?? "(unknown)",
        truncated: i.meta.truncated ?? false,
      })),
    notes: included
      .filter((i) => i.kind === "note")
      .map((i) => ({ id: i.id, title: (i.meta.title ?? "").trim() || "(untitled)" })),
  };

  return { contextBlock, used };
}

const SYSTEM_INSTRUCTION =
  "You are an AI assistant embedded in the Pulse productivity app. The user is asking " +
  "questions about a single project. The PROJECT CONTEXT block below contains the project's " +
  "files and notes verbatim. Answer concisely and accurately, grounding your response in that " +
  "context wherever relevant. If the answer isn't in the context, say so plainly rather than " +
  "guessing. Do not invent file or note names that aren't in the context.";

/**
 * Compose the full prompt sent to aiGenerate from system instruction, the
 * project context block, prior chat history (oldest first), and the new
 * user message.
 */
export function composeChatPrompt(
  contextBlock: string,
  history: ChatMessage[],
  userMessage: string,
): string {
  const historyBlock =
    history.length === 0
      ? ""
      : `\n\nCHAT HISTORY (oldest first):\n${history
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n\n")}`;

  return (
    `${SYSTEM_INSTRUCTION}\n\n` +
    `PROJECT CONTEXT:\n${contextBlock}` +
    historyBlock +
    `\n\nUser: ${userMessage}\n\nAssistant:`
  );
}
