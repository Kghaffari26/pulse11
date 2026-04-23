// Minimal Tiptap/ProseMirror JSON -> Markdown serializer.
// Covers the StarterKit subset the notes editor uses: paragraph, heading,
// bold/italic/strike/code marks, bullet/ordered lists, code blocks,
// blockquote, horizontal rule, hard break. Unknown nodes are passed through
// as their text content so content is never lost, just un-styled.

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

function applyMarks(text: string, marks: TiptapMark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  const names = new Set(marks.map((m) => m.type));
  if (names.has("code")) out = `\`${out}\``;
  if (names.has("bold")) out = `**${out}**`;
  if (names.has("italic")) out = `*${out}*`;
  if (names.has("strike")) out = `~~${out}~~`;
  for (const m of marks) {
    if (m.type === "link" && m.attrs && typeof m.attrs.href === "string") {
      out = `[${out}](${m.attrs.href as string})`;
    }
  }
  return out;
}

function serializeInline(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") {
      out += applyMarks(n.text ?? "", n.marks);
    } else if (n.type === "hardBreak") {
      out += "  \n";
    } else {
      // inline-ish unknown; fall back to its text content
      out += serializeInline(n.content);
    }
  }
  return out;
}

function serializeBlock(node: TiptapNode, listDepth = 0, orderedIndex?: number): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map((c) => serializeBlock(c, listDepth)).join("").trimEnd() + "\n";

    case "paragraph":
      return serializeInline(node.content) + "\n\n";

    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${serializeInline(node.content)}\n\n`;
    }

    case "blockquote":
      return (
        (node.content ?? [])
          .map((c) => serializeBlock(c, listDepth))
          .join("")
          .trimEnd()
          .split("\n")
          .map((ln) => (ln.length ? `> ${ln}` : ">"))
          .join("\n") + "\n\n"
      );

    case "bulletList":
      return (
        (node.content ?? [])
          .map((c) => serializeBlock(c, listDepth + 1))
          .join("") + (listDepth === 0 ? "\n" : "")
      );

    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (
        (node.content ?? [])
          .map((c, i) => serializeBlock(c, listDepth + 1, start + i))
          .join("") + (listDepth === 0 ? "\n" : "")
      );
    }

    case "listItem": {
      const indent = "  ".repeat(Math.max(listDepth - 1, 0));
      const marker = orderedIndex != null ? `${orderedIndex}.` : "-";
      const body = (node.content ?? [])
        .map((c) => serializeBlock(c, listDepth))
        .join("")
        .trimEnd();
      // If the item's first block is a paragraph we want it inline next to the marker.
      const [firstLine, ...rest] = body.split("\n");
      const firstOut = `${indent}${marker} ${firstLine ?? ""}`;
      if (rest.length === 0) return `${firstOut}\n`;
      const restIndent = " ".repeat(marker.length + 1);
      const restOut = rest.map((ln) => (ln.length ? `${indent}${restIndent}${ln}` : "")).join("\n");
      return `${firstOut}\n${restOut}\n`;
    }

    case "codeBlock": {
      const lang = (node.attrs?.language as string | undefined) ?? "";
      const text = serializeInline(node.content);
      return `\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
    }

    case "horizontalRule":
      return "---\n\n";

    case "hardBreak":
      return "  \n";

    case "text":
      return applyMarks(node.text ?? "", node.marks);

    default:
      // Unknown node — render children (if any) or its plain text.
      if (node.content) return node.content.map((c) => serializeBlock(c, listDepth)).join("");
      if (typeof node.text === "string") return node.text;
      return "";
  }
}

/**
 * Convert a Tiptap/ProseMirror doc (as plain JSON) to markdown.
 * Returns an empty string for falsy or empty input.
 */
export function tiptapJsonToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as TiptapNode;
  if (node.type !== "doc") return "";
  return serializeBlock(node).replace(/\n{3,}/g, "\n\n").trimEnd();
}
