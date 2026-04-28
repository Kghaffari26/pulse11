import {
  buildChatContext,
  composeChatPrompt,
  type ChatContextFile,
  type ChatContextNote,
} from "./chat-context";
import { ExtractionError } from "./file-text-extractor";
import { CHAT_CONTEXT_MAX_CHARS, type ChatMessage } from "@/shared/models/chat";

function file(over: Partial<ChatContextFile> = {}): ChatContextFile {
  return {
    id: "f1",
    filename: "doc.pdf",
    blobUrl: "https://blob/doc.pdf",
    mimeType: "application/pdf",
    uploadedAt: "2026-04-01T00:00:00.000Z",
    ...over,
  };
}

function note(over: Partial<ChatContextNote> = {}): ChatContextNote {
  return {
    id: "n1",
    title: "A note",
    contentMarkdown: "Some content.",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...over,
  };
}

const ok = (text: string) =>
  jest.fn().mockResolvedValue({ text, truncated: false });

describe("buildChatContext", () => {
  it("renders files + notes with delimiters and source labels", async () => {
    const extract = jest.fn().mockResolvedValue({ text: "PDF body", truncated: false });
    const { contextBlock, used } = await buildChatContext(
      [file({ id: "f1", filename: "syllabus.pdf" })],
      [note({ id: "n1", title: "Week 1", contentMarkdown: "Read ch. 1" })],
      { extract },
    );
    expect(contextBlock).toContain("=== File: syllabus.pdf ===");
    expect(contextBlock).toContain("PDF body");
    expect(contextBlock).toContain("=== Note: Week 1 ===");
    expect(contextBlock).toContain("Read ch. 1");
    expect(used.files).toEqual([{ id: "f1", filename: "syllabus.pdf", truncated: false }]);
    expect(used.notes).toEqual([{ id: "n1", title: "Week 1" }]);
  });

  it("skips files that fail extraction and logs a warning", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(new ExtractionError("bad.pdf", "corrupt"))
      .mockResolvedValueOnce({ text: "good content", truncated: false });
    const warns: string[] = [];
    const { contextBlock, used } = await buildChatContext(
      [
        file({ id: "f1", filename: "bad.pdf" }),
        file({ id: "f2", filename: "good.pdf", uploadedAt: "2026-04-02T00:00:00.000Z" }),
      ],
      [],
      { extract, logWarn: (m) => warns.push(m) },
    );
    expect(contextBlock).not.toContain("bad.pdf");
    expect(contextBlock).toContain("good.pdf");
    expect(used.files.map((f) => f.id)).toEqual(["f2"]);
    expect(warns.some((w) => w.includes("bad.pdf") && w.includes("corrupt"))).toBe(true);
  });

  it("skips files that have no mime type", async () => {
    const extract = ok("never called");
    const warns: string[] = [];
    const { used } = await buildChatContext(
      [file({ id: "f1", filename: "mystery", mimeType: null })],
      [],
      { extract, logWarn: (m) => warns.push(m) },
    );
    expect(extract).not.toHaveBeenCalled();
    expect(used.files).toEqual([]);
    expect(warns[0]).toMatch(/missing mime type/);
  });

  it("drops empty notes", async () => {
    const { used } = await buildChatContext(
      [],
      [
        note({ id: "n1", contentMarkdown: "" }),
        note({ id: "n2", contentMarkdown: "   " }),
        note({ id: "n3", contentMarkdown: "real content" }),
      ],
    );
    expect(used.notes.map((n) => n.id)).toEqual(["n3"]);
  });

  it("preserves newest items when total exceeds CHAT_CONTEXT_MAX_CHARS", async () => {
    // Make each rendered item ~40k chars; only 2 should fit under 100k.
    const big = "x".repeat(40_000);
    const extract = jest.fn().mockResolvedValue({ text: big, truncated: false });
    const files: ChatContextFile[] = [
      file({ id: "f-old", filename: "old.pdf", uploadedAt: "2026-04-01T00:00:00.000Z" }),
      file({ id: "f-mid", filename: "mid.pdf", uploadedAt: "2026-04-05T00:00:00.000Z" }),
      file({ id: "f-new", filename: "new.pdf", uploadedAt: "2026-04-10T00:00:00.000Z" }),
    ];
    const { contextBlock, used } = await buildChatContext(files, [], { extract });

    expect(used.files.map((f) => f.id).sort()).toEqual(["f-mid", "f-new"]);
    expect(contextBlock.length).toBeLessThanOrEqual(CHAT_CONTEXT_MAX_CHARS);
    expect(contextBlock).not.toContain("old.pdf");
  });

  it("renders truncated files with a [...truncated] marker", async () => {
    const extract = jest.fn().mockResolvedValue({ text: "partial", truncated: true });
    const { contextBlock, used } = await buildChatContext(
      [file({ id: "f1", filename: "huge.pdf" })],
      [],
      { extract },
    );
    expect(contextBlock).toContain("[...truncated]");
    expect(used.files[0]?.truncated).toBe(true);
  });

  it("returns a placeholder when no items are available", async () => {
    const { contextBlock, used } = await buildChatContext([], []);
    expect(contextBlock).toContain("No files or notes attached");
    expect(used.files).toEqual([]);
    expect(used.notes).toEqual([]);
  });
});

describe("composeChatPrompt", () => {
  function msg(role: "user" | "assistant", content: string, id = role): ChatMessage {
    return {
      id,
      projectId: "p",
      userEmail: "u",
      role,
      content,
      contextUsed: null,
      createdAt: "2026-04-01T00:00:00.000Z",
    };
  }

  it("includes system instruction, context, and user message when history is empty", () => {
    const prompt = composeChatPrompt("CTX", [], "Hi");
    expect(prompt).toContain("You are an AI assistant");
    expect(prompt).toContain("PROJECT CONTEXT:\nCTX");
    expect(prompt).not.toContain("CHAT HISTORY");
    expect(prompt).toMatch(/User: Hi\n\nAssistant:$/);
  });

  it("renders history with role labels and oldest-first ordering", () => {
    const history = [msg("user", "First Q", "1"), msg("assistant", "First A", "2")];
    const prompt = composeChatPrompt("CTX", history, "Follow up");
    expect(prompt).toContain("CHAT HISTORY (oldest first):");
    expect(prompt.indexOf("User: First Q")).toBeLessThan(prompt.indexOf("Assistant: First A"));
    expect(prompt.indexOf("Assistant: First A")).toBeLessThan(prompt.indexOf("User: Follow up"));
  });
});
