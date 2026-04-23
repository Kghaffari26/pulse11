export interface Note {
  id: string;
  projectId: string;
  userEmail: string;
  title: string | null;
  contentJson: Record<string, unknown> | null;
  contentMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteCreateInput {
  title?: string | null;
  contentJson?: Record<string, unknown> | null;
  contentMarkdown?: string | null;
}

export interface NotePatch {
  title?: string | null;
  contentJson?: Record<string, unknown> | null;
  contentMarkdown?: string | null;
}

export const NOTE_TITLE_MAX = 200;
// Rough cap; Tiptap JSON + markdown for novel-length notes still fits.
export const NOTE_MARKDOWN_MAX = 200_000;

// Including the opposite field as `undefined` on each branch lets TypeScript
// narrow correctly even with strictNullChecks off in this project's tsconfig.
export type Validation<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: string; value?: undefined };

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function validateShared(
  obj: Record<string, unknown>,
  out: { title?: string | null; contentJson?: Record<string, unknown> | null; contentMarkdown?: string | null },
): Validation<void> {
  if ("title" in obj) {
    const t = obj.title;
    if (t == null) {
      out.title = null;
    } else if (typeof t !== "string") {
      return { ok: false, error: "title must be a string" };
    } else if (t.length > NOTE_TITLE_MAX) {
      return { ok: false, error: `Title must be <= ${NOTE_TITLE_MAX} characters` };
    } else {
      out.title = t;
    }
  }
  if ("contentJson" in obj) {
    const j = obj.contentJson;
    if (j == null) {
      out.contentJson = null;
    } else if (!isPlainObject(j)) {
      return { ok: false, error: "contentJson must be a JSON object" };
    } else {
      out.contentJson = j;
    }
  }
  if ("contentMarkdown" in obj) {
    const m = obj.contentMarkdown;
    if (m == null) {
      out.contentMarkdown = null;
    } else if (typeof m !== "string") {
      return { ok: false, error: "contentMarkdown must be a string" };
    } else if (m.length > NOTE_MARKDOWN_MAX) {
      return { ok: false, error: `contentMarkdown too large (max ${NOTE_MARKDOWN_MAX} chars)` };
    } else {
      out.contentMarkdown = m;
    }
  }
  return { ok: true, value: undefined };
}

export function validateNoteCreate(input: unknown): Validation<NoteCreateInput> {
  if (!isPlainObject(input)) return { ok: false, error: "Invalid note input" };
  const out: NoteCreateInput = {};
  const shared = validateShared(input, out);
  if (!shared.ok) return { ok: false, error: shared.error };
  return { ok: true, value: out };
}

export function validateNotePatch(input: unknown): Validation<NotePatch> {
  if (!isPlainObject(input)) return { ok: false, error: "Invalid note patch" };
  const out: NotePatch = {};
  const shared = validateShared(input, out);
  if (!shared.ok) return { ok: false, error: shared.error };
  return { ok: true, value: out };
}
