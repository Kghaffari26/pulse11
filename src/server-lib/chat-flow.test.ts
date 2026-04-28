/**
 * End-to-end coverage for the chat POST flow.
 *
 * Real modules: handleChatTurn, buildChatContext, composeChatPrompt,
 * defaultChatStore replacement (in-memory), validateChatMessage.
 * Mocks: only at the I/O boundary — file extraction (network) and aiGenerate
 * (Gemini/OpenAI). This catches wiring regressions across modules that the
 * focused unit tests cannot.
 */

import { handleChatTurn } from "./chat-handler";
import { buildChatContext, type ChatContextFile, type ChatContextNote } from "./chat-context";
import type { ChatStore } from "./chat-store";
import type { ChatContextUsed, ChatMessage, ChatRole } from "@/shared/models/chat";
import type { AiGenerateResult } from "./ai-generate";

function makeStore(): { store: ChatStore; rows: ChatMessage[] } {
  const rows: ChatMessage[] = [];
  let n = 1;
  return {
    rows,
    store: {
      async insert({ projectId, userEmail, role, content, contextUsed }) {
        const m: ChatMessage = {
          id: `m${n++}`,
          projectId,
          userEmail,
          role: role as ChatRole,
          content,
          contextUsed: (contextUsed as ChatContextUsed | undefined) ?? null,
          createdAt: new Date(2026, 3, 27, 10, n).toISOString(),
        };
        rows.push(m);
        return m;
      },
      async recent() {
        return rows.slice(-20);
      },
      async page() {
        return rows;
      },
      async clear() {
        const n2 = rows.length;
        rows.length = 0;
        return n2;
      },
    },
  };
}

describe("chat flow end-to-end", () => {
  it("threads a full turn: user msg → context+history → AI → assistant msg with sources", async () => {
    const { store, rows } = makeStore();

    const files: ChatContextFile[] = [
      {
        id: "file-1",
        filename: "syllabus.pdf",
        blobUrl: "https://blob/syllabus.pdf",
        mimeType: "application/pdf",
        uploadedAt: "2026-04-20T00:00:00.000Z",
      },
    ];
    const notes: ChatContextNote[] = [
      {
        id: "note-1",
        title: "Week 1",
        contentMarkdown: "Read chapter 1.",
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
    ];

    // Capture what the AI was actually given so we can assert on it.
    let promptSeen = "";
    const generate = jest
      .fn()
      .mockImplementationOnce(async ({ prompt }: { prompt: string }) => {
        promptSeen = prompt;
        return {
          ok: true,
          text: "Chapter 1 covers the basics.",
          provider: "gemini",
          tier: "free",
          model: "gemini-2.5-flash",
          remainingFreeTier: 19,
        } as AiGenerateResult;
      });

    const extract = jest.fn().mockResolvedValue({
      text: "Course goals: ... Grading: ...",
      truncated: false,
    });

    // Use the real buildChatContext (not the fake from chat-handler.test) by
    // wrapping it to inject the mocked extractor.
    const wrappedBuild: typeof buildChatContext = (f, n, _deps) =>
      buildChatContext(f, n, { extract });

    const result = await handleChatTurn({
      projectId: "proj-1",
      userId: "user-1",
      message: "What's in the syllabus?",
      deps: {
        chatStore: store,
        generate,
        loadFiles: async () => files,
        loadNotes: async () => notes,
        buildContext: wrappedBuild,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both messages persisted, in correct order.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ role: "user", content: "What's in the syllabus?" });
    expect(rows[1]).toMatchObject({
      role: "assistant",
      content: "Chapter 1 covers the basics.",
    });
    expect(rows[1]?.contextUsed).toEqual({
      files: [{ id: "file-1", filename: "syllabus.pdf", truncated: false }],
      notes: [{ id: "note-1", title: "Week 1" }],
    });

    // The prompt sent to AI integrated context, with both sources rendered
    // and the user's question at the tail.
    expect(extract).toHaveBeenCalledWith(
      "https://blob/syllabus.pdf",
      "application/pdf",
      "syllabus.pdf",
      undefined,
    );
    expect(promptSeen).toContain("=== File: syllabus.pdf ===");
    expect(promptSeen).toContain("Course goals");
    expect(promptSeen).toContain("=== Note: Week 1 ===");
    expect(promptSeen).toContain("Read chapter 1.");
    expect(promptSeen).toMatch(/User: What's in the syllabus\?\n\nAssistant:$/);

    // Free-tier remaining count surfaced for the UI.
    expect(result.remainingFreeTier).toBe(19);
  });

  it("threads previous turns into history on the second message", async () => {
    const { store, rows } = makeStore();

    const generate = jest.fn().mockResolvedValue({
      ok: true,
      text: "Second answer.",
      provider: "gemini",
      tier: "byok",
      model: "gemini-2.5-pro",
    } as AiGenerateResult);

    const wrappedBuild: typeof buildChatContext = (f, n) =>
      buildChatContext(f, n, { extract: jest.fn().mockResolvedValue({ text: "ctx", truncated: false }) });

    // First turn.
    await handleChatTurn({
      projectId: "p",
      userId: "u",
      message: "First Q",
      deps: {
        chatStore: store,
        generate: jest.fn().mockResolvedValue({
          ok: true,
          text: "First answer.",
          provider: "gemini",
          tier: "byok",
          model: "gemini-2.5-pro",
        } as AiGenerateResult),
        loadFiles: async () => [],
        loadNotes: async () => [],
        buildContext: wrappedBuild,
      },
    });

    // Second turn — the history should now include the first Q+A.
    await handleChatTurn({
      projectId: "p",
      userId: "u",
      message: "Second Q",
      deps: {
        chatStore: store,
        generate,
        loadFiles: async () => [],
        loadNotes: async () => [],
        buildContext: wrappedBuild,
      },
    });

    expect(rows).toHaveLength(4);
    const lastPrompt = (generate.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(lastPrompt).toContain("CHAT HISTORY (oldest first):");
    expect(lastPrompt).toContain("User: First Q");
    expect(lastPrompt).toContain("Assistant: First answer.");
    // The new user message is in the trailing slot, not duplicated in history.
    const newQHits = lastPrompt.split("User: Second Q").length - 1;
    expect(newQHits).toBe(1);
  });
});
