import { handleChatTurn } from "./chat-handler";
import type { ChatStore } from "./chat-store";
import type { ChatContextFile, ChatContextNote, BuiltContext } from "./chat-context";
import type { ChatContextUsed, ChatMessage, ChatRole } from "@/shared/models/chat";
import type { AiGenerateResult } from "./ai-generate";

function makeStore(initial: ChatMessage[] = []): {
  store: ChatStore;
  inserted: ChatMessage[];
} {
  const inserted: ChatMessage[] = [...initial];
  let nextId = inserted.length + 1;
  const store: ChatStore = {
    async insert({ projectId, userEmail, role, content, contextUsed }) {
      const m: ChatMessage = {
        id: `m${nextId++}`,
        projectId,
        userEmail,
        role: role as ChatRole,
        content,
        contextUsed: (contextUsed as ChatContextUsed | undefined) ?? null,
        createdAt: new Date().toISOString(),
      };
      inserted.push(m);
      return m;
    },
    async recent() {
      return inserted.slice(-20);
    },
    async page() {
      return inserted;
    },
    async clear() {
      const n = inserted.length;
      inserted.length = 0;
      return n;
    },
  };
  return { store, inserted };
}

function fakeContext(): typeof import("./chat-context").buildChatContext {
  return (async () => ({
    contextBlock: "FAKE CONTEXT",
    used: { files: [{ id: "f1", filename: "x.pdf", truncated: false }], notes: [] },
  })) as unknown as typeof import("./chat-context").buildChatContext;
}

describe("handleChatTurn", () => {
  it("persists user message, calls aiGenerate, persists assistant with context_used", async () => {
    const { store, inserted } = makeStore();
    const generate = jest.fn().mockResolvedValue({
      ok: true,
      text: "the answer",
      provider: "gemini",
      tier: "free",
      model: "gemini-2.5-flash",
      remainingFreeTier: 17,
    } as AiGenerateResult);

    const res = await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "What's in this project?",
      deps: { chatStore: store, generate, buildContext: fakeContext(), loadFiles: async () => [], loadNotes: async () => [] },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.userMessage.role).toBe("user");
    expect(res.userMessage.content).toBe("What's in this project?");
    expect(res.assistantMessage.role).toBe("assistant");
    expect(res.assistantMessage.content).toBe("the answer");
    expect(res.assistantMessage.contextUsed).toEqual({
      files: [{ id: "f1", filename: "x.pdf", truncated: false }],
      notes: [],
    });
    expect(res.remainingFreeTier).toBe(17);
    expect(inserted).toHaveLength(2);
  });

  it("passes the user message + composed prompt to aiGenerate", async () => {
    const { store } = makeStore();
    const generate = jest.fn().mockResolvedValue({
      ok: true,
      text: "ok",
      provider: "gemini",
      tier: "byok",
      model: "gemini-2.5-pro",
    } as AiGenerateResult);

    await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "Summarize the syllabus",
      deps: { chatStore: store, generate, buildContext: fakeContext(), loadFiles: async () => [], loadNotes: async () => [] },
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const arg = generate.mock.calls[0]![0] as { userId: string; prompt: string };
    expect(arg.userId).toBe("u1");
    expect(arg.prompt).toContain("FAKE CONTEXT");
    expect(arg.prompt).toContain("User: Summarize the syllabus");
    expect(arg.prompt).toMatch(/Assistant:$/);
  });

  it("returns quota_exhausted with status 429 and does NOT insert assistant message", async () => {
    const { store, inserted } = makeStore();
    const generate = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      error: "Monthly free tier exhausted. Add your API key in Settings.",
      type: "quota_exhausted",
      remainingFreeTier: 0,
    } as AiGenerateResult);

    const res = await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "Hi",
      deps: { chatStore: store, generate, buildContext: fakeContext(), loadFiles: async () => [], loadNotes: async () => [] },
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("quota_exhausted");
    expect(res.status).toBe(429);
    expect(inserted).toHaveLength(1); // user message persisted, no assistant
    expect(inserted[0]!.role).toBe("user");
  });

  it("returns provider_error with the upstream status when AI fails", async () => {
    const { store, inserted } = makeStore();
    const generate = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      error: "AI providers unavailable",
      type: "provider_error",
    } as AiGenerateResult);

    const res = await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "Hi",
      deps: { chatStore: store, generate, buildContext: fakeContext(), loadFiles: async () => [], loadNotes: async () => [] },
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.kind).toBe("provider_error");
    expect(res.status).toBe(503);
    expect(inserted).toHaveLength(1);
  });

  it("excludes the just-inserted user message from history threaded into the prompt", async () => {
    const prior: ChatMessage = {
      id: "old1",
      projectId: "p1",
      userEmail: "u1",
      role: "user",
      content: "earlier question",
      contextUsed: null,
      createdAt: "2026-04-01T00:00:00.000Z",
    };
    const { store } = makeStore([prior]);
    const generate = jest.fn().mockResolvedValue({
      ok: true,
      text: "ok",
      provider: "gemini",
      tier: "byok",
      model: "gemini-2.5-pro",
    } as AiGenerateResult);

    await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "now this",
      deps: { chatStore: store, generate, buildContext: fakeContext(), loadFiles: async () => [], loadNotes: async () => [] },
    });

    const prompt = (generate.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(prompt).toContain("User: earlier question");
    // The new "now this" should appear ONCE, in the trailing User: slot, never duplicated in CHAT HISTORY.
    const occurrences = prompt.split("User: now this").length - 1;
    expect(occurrences).toBe(1);
  });

  it("persists context_used.failed onto the assistant message when files fail extraction", async () => {
    const { store, inserted } = makeStore();
    const generate = jest.fn().mockResolvedValue({
      ok: true,
      text: "I couldn't see the PDF, but here's what I have.",
      provider: "gemini",
      tier: "byok",
      model: "gemini-2.5-pro",
    } as AiGenerateResult);

    const failedBuildContext: typeof import("./chat-context").buildChatContext = (async () => ({
      contextBlock: "(No files or notes attached to this project yet.)",
      used: {
        files: [],
        notes: [],
        failed: [{ filename: "declaration.pdf", reason: "Setting up fake worker failed" }],
      },
    })) as unknown as typeof import("./chat-context").buildChatContext;

    const res = await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "What does the PDF say?",
      deps: {
        chatStore: store,
        generate,
        loadFiles: async () => [],
        loadNotes: async () => [],
        buildContext: failedBuildContext,
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(inserted[1]?.contextUsed).toEqual({
      files: [],
      notes: [],
      failed: [{ filename: "declaration.pdf", reason: "Setting up fake worker failed" }],
    });
  });

  it("invokes loaders with project + user scope", async () => {
    const { store } = makeStore();
    const loadFiles = jest.fn().mockResolvedValue([]);
    const loadNotes = jest.fn().mockResolvedValue([]);
    const generate = jest.fn().mockResolvedValue({
      ok: true,
      text: "ok",
      provider: "gemini",
      tier: "byok",
      model: "gemini-2.5-pro",
    } as AiGenerateResult);

    await handleChatTurn({
      projectId: "p1",
      userId: "u1",
      message: "hi",
      deps: { chatStore: store, generate, buildContext: fakeContext(), loadFiles, loadNotes },
    });

    expect(loadFiles).toHaveBeenCalledWith("p1", "u1");
    expect(loadNotes).toHaveBeenCalledWith("p1", "u1");
  });
});
