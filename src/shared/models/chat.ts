export type ChatRole = "user" | "assistant" | "system";

export interface ChatContextSourceFile {
  id: string;
  filename: string;
  truncated: boolean;
}

export interface ChatContextSourceNote {
  id: string;
  title: string;
}

/**
 * Stored on each assistant message so the UI can show "Used N files, M notes"
 * and let the user expand to see the source list — without re-running the
 * prompt or holding all the context in memory.
 */
export interface ChatContextUsed {
  files: ChatContextSourceFile[];
  notes: ChatContextSourceNote[];
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userEmail: string;
  role: ChatRole;
  content: string;
  contextUsed: ChatContextUsed | null;
  createdAt: string;
}

export const CHAT_MESSAGE_MAX = 4000;
export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_PAGE_DEFAULT = 50;
export const CHAT_PAGE_MAX = 200;
export const CHAT_CONTEXT_MAX_CHARS = 100_000;

import type { Validation } from "./ai";

export function validateChatMessage(input: unknown): Validation<string> {
  if (typeof input !== "string") return { ok: false, error: "message must be a string" };
  const v = input.trim();
  if (v.length === 0) return { ok: false, error: "message is required" };
  if (v.length > CHAT_MESSAGE_MAX) {
    return { ok: false, error: `message must be <= ${CHAT_MESSAGE_MAX} characters` };
  }
  return { ok: true, value: v };
}
