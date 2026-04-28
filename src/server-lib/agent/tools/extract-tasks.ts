import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { extractText } from "@/server-lib/file-text-extractor";
import type { AgentTool } from "../tools";

export interface ExtractedTask {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  priority?: "low" | "medium" | "high" | null;
}

interface ExtractDeps {
  extract?: typeof extractText;
  query?: typeof queryInternalDatabase;
}

const PROMPT = (text: string) =>
  `You are extracting actionable items from a course syllabus or assignment list.\n\n` +
  `Return a JSON array. Each item: {\n` +
  `  "title": string (required, <= 120 chars),\n` +
  `  "description": string | null,\n` +
  `  "dueDate": ISO 8601 date string (YYYY-MM-DD) | null,\n` +
  `  "estimatedHours": number | null,\n` +
  `  "priority": "low" | "medium" | "high" | null\n` +
  `}\n\n` +
  `Rules:\n` +
  `- Only include assignments, projects, exams, papers, deliverables. Skip readings unless they're a graded artifact.\n` +
  `- If a date is relative ("week 3"), set dueDate to null.\n` +
  `- Return [] if there are no clear tasks.\n` +
  `- Output ONLY the JSON array, no prose, no markdown fences.\n\n` +
  `DOCUMENT:\n${text}`;

export function parseExtractedTasks(raw: string): ExtractedTask[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();

  const tryParse = (text: string): ExtractedTask[] | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return null;
      const out: ExtractedTask[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const obj = item as Record<string, unknown>;
        const title = typeof obj.title === "string" ? obj.title.trim() : "";
        if (!title) continue;
        out.push({
          title: title.slice(0, 120),
          description: typeof obj.description === "string" ? obj.description : null,
          dueDate: typeof obj.dueDate === "string" ? obj.dueDate : null,
          estimatedHours:
            typeof obj.estimatedHours === "number" && Number.isFinite(obj.estimatedHours)
              ? obj.estimatedHours
              : null,
          priority:
            obj.priority === "low" || obj.priority === "medium" || obj.priority === "high"
              ? obj.priority
              : null,
        });
      }
      return out;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) {
    const fromMatch = tryParse(match[0]);
    if (fromMatch) return fromMatch;
  }
  return [];
}

const PRIORITY_MAP: Record<string, "Low" | "Medium" | "High"> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Default deadline when the model returns null: two weeks from now. Tasks
 * without a real due date still need *some* deadline to slot into the
 * existing pulse_tasks scheduler — the user can adjust on the task list.
 */
function deadlineForExtracted(due: string | null | undefined): string {
  if (due && /^\d{4}-\d{2}-\d{2}/.test(due)) {
    const d = new Date(due);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 14);
  return fallback.toISOString();
}

export interface ExtractTasksArgs {
  fileId: string;
  projectId: string;
}

export async function runExtractTasks(
  args: ExtractTasksArgs,
  ctx: { userId: string; aiGenerate: (prompt: string) => Promise<string> },
  deps: ExtractDeps = {},
): Promise<string> {
  const query = deps.query ?? queryInternalDatabase;
  const extract = deps.extract ?? extractText;

  if (!args.fileId || typeof args.fileId !== "string") throw new Error("fileId is required");
  if (!args.projectId || typeof args.projectId !== "string") {
    throw new Error("projectId is required");
  }

  const rows = await query(
    `SELECT id, project_id, filename, blob_url, mime_type
       FROM vybe_project_files
      WHERE id = $1 AND project_id = $2 AND user_email = $3`,
    [args.fileId, args.projectId, ctx.userId],
  );
  if (rows.length === 0) throw new Error("File not found or not accessible");
  const file = rows[0] as Record<string, unknown>;

  const mime = (file.mime_type as string | null) ?? "";
  if (!mime) throw new Error(`File ${file.filename as string} has no mime type — cannot extract`);

  const extracted = await extract(file.blob_url as string, mime, file.filename as string);
  if (!extracted.text.trim()) {
    return "No readable text in this file. Tasks cannot be extracted.";
  }

  const raw = await ctx.aiGenerate(PROMPT(extracted.text));
  const tasks = parseExtractedTasks(raw);

  if (tasks.length === 0) {
    return "No tasks found in this file. The file may not be a syllabus or assignment list.";
  }

  const insertedTitles: string[] = [];
  for (const t of tasks) {
    const id = uid("task");
    const priority = t.priority ? PRIORITY_MAP[t.priority] : "Medium";
    const estimatedMinutes =
      typeof t.estimatedHours === "number" && t.estimatedHours > 0
        ? Math.round(t.estimatedHours * 60)
        : 60;
    await query(
      `INSERT INTO pulse_tasks
         (id, user_email, title, category, deadline, estimated_minutes, priority, mode,
          description, project_id, status)
       VALUES ($1, $2, $3, 'School', $4, $5, $6, 'student', $7, $8, 'pending')`,
      [
        id,
        ctx.userId,
        t.title,
        deadlineForExtracted(t.dueDate),
        estimatedMinutes,
        priority,
        t.description ?? null,
        args.projectId,
      ],
    );
    insertedTitles.push(t.title);
  }

  const titlePreview = insertedTitles.slice(0, 5).join(", ");
  const tail = insertedTitles.length > 5 ? `, … (+${insertedTitles.length - 5} more)` : "";
  return `Extracted ${insertedTitles.length} task${insertedTitles.length === 1 ? "" : "s"}: ${titlePreview}${tail}`;
}

export const extractTasksTool: AgentTool = {
  name: "extract_tasks_from_file",
  description:
    "Read a project file (typically a syllabus) and create pulse_tasks rows for every assignment, exam, or deliverable. Args: { fileId: string, projectId: string }.",
  async run(args, ctx) {
    if (!ctx.projectId) throw new Error("extract_tasks_from_file requires a project context");
    const fileId = typeof args.fileId === "string" ? args.fileId : "";
    const projectId = typeof args.projectId === "string" ? args.projectId : ctx.projectId;
    return runExtractTasks({ fileId, projectId }, ctx);
  },
};
