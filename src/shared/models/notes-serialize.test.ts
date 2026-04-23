import { tiptapJsonToMarkdown } from "./notes-serialize";
import { validateNoteCreate, validateNotePatch } from "./notes";

describe("tiptapJsonToMarkdown", () => {
  it("serializes a plain paragraph", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    };
    expect(tiptapJsonToMarkdown(doc)).toBe("Hello world");
  });

  it("applies bold, italic, and code marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: " and " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
          ],
        },
      ],
    };
    expect(tiptapJsonToMarkdown(doc)).toBe("plain **bold** and *italic* and `code`");
  });

  it("serializes headings at the right level", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "body" }] },
      ],
    };
    expect(tiptapJsonToMarkdown(doc)).toBe("## Title\n\nbody");
  });

  it("serializes bullet and ordered lists", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
          ],
        },
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    };
    const md = tiptapJsonToMarkdown(doc);
    expect(md).toContain("- a");
    expect(md).toContain("- b");
    expect(md).toContain("1. one");
    expect(md).toContain("2. two");
  });

  it("serializes code blocks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(tiptapJsonToMarkdown(doc)).toBe("```ts\nconst x = 1;\n```");
  });

  it("returns empty string for invalid input", () => {
    expect(tiptapJsonToMarkdown(null)).toBe("");
    expect(tiptapJsonToMarkdown({})).toBe("");
    expect(tiptapJsonToMarkdown({ type: "not-a-doc" })).toBe("");
  });
});

// Autosave contract: the wire format the editor sends to the server must be
// accepted by validateNotePatch — this test locks in that shape so a future
// refactor can't silently break autosave.
describe("note autosave contract", () => {
  it("accepts the full {title, contentJson, contentMarkdown} payload", () => {
    const payload = {
      title: "Draft note",
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
      },
      contentMarkdown: "hi",
    };
    const r = validateNotePatch(payload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Draft note");
      expect(r.value.contentMarkdown).toBe("hi");
      expect(r.value.contentJson).toEqual(payload.contentJson);
    }
  });

  it("accepts a partial patch (title only)", () => {
    const r = validateNotePatch({ title: "Only title" });
    expect(r.ok).toBe(true);
  });

  it("accepts explicit nulls to clear content", () => {
    const r = validateNotePatch({ contentJson: null, contentMarkdown: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contentJson).toBeNull();
      expect(r.value.contentMarkdown).toBeNull();
    }
  });

  it("rejects a non-object contentJson", () => {
    expect(validateNotePatch({ contentJson: "foo" }).ok).toBe(false);
    expect(validateNotePatch({ contentJson: [] }).ok).toBe(false);
  });

  it("rejects oversize payloads at the create boundary", () => {
    const huge = "x".repeat(200_001);
    expect(validateNoteCreate({ contentMarkdown: huge }).ok).toBe(false);
  });
});
