import { aiGenerate, type AiGenerateResult } from "./ai-generate";
import { buildChatContext, composeChatPrompt, type ChatContextFile, type ChatContextNote } from "./chat-context";
import { defaultChatStore, type ChatStore } from "./chat-store";
import type { ChatMessage } from "@/shared/models/chat";

export type ChatHandlerResult =
  | {
      ok: true;
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      remainingFreeTier?: number;
      kind?: undefined;
      status?: undefined;
      error?: undefined;
    }
  | {
      ok: false;
      kind: "quota_exhausted" | "provider_error";
      status: number;
      error: string;
      userMessage?: undefined;
      assistantMessage?: undefined;
      remainingFreeTier?: undefined;
    };

export interface ChatHandlerDeps {
  chatStore?: ChatStore;
  generate?: typeof aiGenerate;
  loadFiles?: (projectId: string, userId: string) => Promise<ChatContextFile[]>;
  loadNotes?: (projectId: string, userId: string) => Promise<ChatContextNote[]>;
  buildContext?: typeof buildChatContext;
}

export interface ChatHandlerInput {
  projectId: string;
  userId: string;
  message: string;
  deps?: ChatHandlerDeps;
}

/**
 * Orchestrates a single user-message turn:
 *   1. Persist the user's message.
 *   2. Build the project-context block from files + notes.
 *   3. Compose the full prompt with chat history.
 *   4. Call aiGenerate (BYOK / free-tier policy applies automatically).
 *   5. Persist the assistant response with context_used metadata.
 *
 * Failure modes (quota, provider) keep the user message persisted so the UI
 * can show what was asked and offer retry, but do not insert an assistant row.
 */
export async function handleChatTurn({
  projectId,
  userId,
  message,
  deps = {},
}: ChatHandlerInput): Promise<ChatHandlerResult> {
  const chatStore = deps.chatStore ?? defaultChatStore;
  const generate = deps.generate ?? aiGenerate;
  const buildContext = deps.buildContext ?? buildChatContext;

  const userMessage = await chatStore.insert({
    projectId,
    userEmail: userId,
    role: "user",
    content: message,
  });

  const [files, notes, history] = await Promise.all([
    deps.loadFiles ? deps.loadFiles(projectId, userId) : Promise.resolve<ChatContextFile[]>([]),
    deps.loadNotes ? deps.loadNotes(projectId, userId) : Promise.resolve<ChatContextNote[]>([]),
    chatStore.recent(projectId, userId),
  ]);

  // Exclude the just-inserted user message from history (we'll append it
  // explicitly as "User: ..." at the end of the prompt).
  const priorHistory = history.filter((m) => m.id !== userMessage.id);

  const { contextBlock, used } = await buildContext(files, notes);
  const prompt = composeChatPrompt(contextBlock, priorHistory, message);

  const result: AiGenerateResult = await generate({ userId, prompt });

  if (!result.ok) {
    if (result.type === "quota_exhausted") {
      return {
        ok: false,
        kind: "quota_exhausted",
        status: 429,
        error: result.error,
      };
    }
    return {
      ok: false,
      kind: "provider_error",
      status: result.status,
      error: result.error,
    };
  }

  const assistantMessage = await chatStore.insert({
    projectId,
    userEmail: userId,
    role: "assistant",
    content: result.text,
    contextUsed: used,
  });

  return {
    ok: true,
    userMessage,
    assistantMessage,
    remainingFreeTier: result.remainingFreeTier,
  };
}
