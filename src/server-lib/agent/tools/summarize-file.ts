import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { extractText } from "@/server-lib/file-text-extractor";
import type { AgentTool } from "../tools";

interface SummarizeDeps {
  extract?: typeof extractText;
  query?: typeof queryInternalDatabase;
}

const PROMPT = (filename: string, text: string) =>
  `Summarize this document into the following sections, using markdown headings (## ...):\n\n` +
  `1. **Main thesis or purpose** — one paragraph.\n` +
  `2. **Key points** — 3 to 5 bulleted points.\n` +
  `3. **Action items or next steps** — bullets, only if applicable; otherwise omit this section entirely.\n\n` +
  `Be concrete. Quote concrete terms from the document where useful. Do not pad.\n\n` +
  `Filename: ${filename}\n\n` +
  `DOCUMENT:\n${text}`;

export interface SummarizeFileArgs {
  fileId: string;
  projectId: string;
}

export async function runSummarizeFile(
  args: SummarizeFileArgs,
  ctx: { userId: string; aiGenerate: (prompt: string) => Promise<string> },
  deps: SummarizeDeps = {},
): Promise<string> {
  const query = deps.query ?? queryInternalDatabase;
  const extract = deps.extract ?? extractText;

  if (!args.fileId || typeof args.fileId !== "string") throw new Error("fileId is required");
  if (!args.projectId || typeof args.projectId !== "string") {
    throw new Error("projectId is required");
  }

  const rows = await query(
    `SELECT id, filename, blob_url, mime_type
       FROM vybe_project_files
      WHERE id = $1 AND project_id = $2 AND user_email = $3`,
    [args.fileId, args.projectId, ctx.userId],
  );
  if (rows.length === 0) throw new Error("File not found or not accessible");
  const file = rows[0] as Record<string, unknown>;
  const filename = (file.filename as string) ?? "(unnamed)";

  const mime = (file.mime_type as string | null) ?? "";
  if (!mime) throw new Error(`File ${filename} has no mime type — cannot extract`);

  const extracted = await extract(file.blob_url as string, mime, filename);
  if (!extracted.text.trim()) {
    return `No readable text in ${filename}. Nothing to summarize.`;
  }

  const summary = await ctx.aiGenerate(PROMPT(filename, extracted.text));
  if (!summary.trim()) throw new Error("Empty summary returned by the model");

  const title = `Summary of ${filename}`;
  await query(
    `INSERT INTO vybe_project_notes (project_id, user_email, title, content_markdown)
     VALUES ($1, $2, $3, $4)`,
    [args.projectId, ctx.userId, title, summary],
  );

  return `Summary saved as note: ${title}`;
}

export const summarizeFileTool: AgentTool = {
  name: "summarize_file",
  description:
    "Extract a project file's text and save a markdown summary as a project note. Args: { fileId: string, projectId: string }.",
  async run(args, ctx) {
    if (!ctx.projectId) throw new Error("summarize_file requires a project context");
    const fileId = typeof args.fileId === "string" ? args.fileId : "";
    const projectId = typeof args.projectId === "string" ? args.projectId : ctx.projectId;
    return runSummarizeFile({ fileId, projectId }, ctx);
  },
};
