import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import type { AgentTool } from "../tools";

interface StudyPlanDeps {
  query?: typeof queryInternalDatabase;
  now?: Date;
}

interface PlanContext {
  tasks: Array<{
    title: string;
    description: string | null;
    deadline: string | null;
    estimatedHours: number;
    priority: string;
  }>;
  fileTitles: string[];
  noteTitles: string[];
}

const MIN_WEEKS = 1;
const MAX_WEEKS = 12;

function clampWeeks(n: unknown, fallback = 4): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, v));
}

function buildPrompt(weeksAhead: number, ctx: PlanContext): string {
  const tasksBlock =
    ctx.tasks.length === 0
      ? "(no incomplete tasks in this project)"
      : ctx.tasks
          .map((t) => {
            const due = t.deadline ? ` due ${t.deadline.slice(0, 10)}` : " (no due date)";
            const hrs = ` ~${t.estimatedHours}h`;
            const desc = t.description ? ` — ${t.description.slice(0, 120)}` : "";
            return `- [${t.priority}] ${t.title}${due}${hrs}${desc}`;
          })
          .join("\n");
  const filesBlock = ctx.fileTitles.length === 0 ? "(none)" : ctx.fileTitles.map((f) => `- ${f}`).join("\n");
  const notesBlock = ctx.noteTitles.length === 0 ? "(none)" : ctx.noteTitles.map((n) => `- ${n}`).join("\n");

  return (
    `You are an academic planner. Build a week-by-week study plan for the next ${weeksAhead} ` +
    `week${weeksAhead === 1 ? "" : "s"} based on this project's tasks and resources.\n\n` +
    `INCOMPLETE TASKS (with deadlines and estimated hours):\n${tasksBlock}\n\n` +
    `AVAILABLE FILES (titles only, you cannot read contents):\n${filesBlock}\n\n` +
    `EXISTING NOTES (titles only):\n${notesBlock}\n\n` +
    `Output: a markdown plan. For each week:\n` +
    `- ## Week N (start date — end date)\n` +
    `- which specific tasks to focus on (cite the task titles verbatim)\n` +
    `- recommended hours per task this week\n` +
    `- any prep work the student should do (review notes, read files)\n\n` +
    `Front-load weeks with looming deadlines. If a task spans multiple weeks, split estimated hours across them. ` +
    `If tasks are sparse, fill the plan with review/prep work using the listed files and notes. ` +
    `Be specific; don't write "study the material".`
  );
}

export interface GenerateStudyPlanArgs {
  projectId: string;
  weeksAhead?: number;
}

export async function runGenerateStudyPlan(
  args: GenerateStudyPlanArgs,
  ctx: { userId: string; aiGenerate: (prompt: string) => Promise<string> },
  deps: StudyPlanDeps = {},
): Promise<string> {
  const query = deps.query ?? queryInternalDatabase;
  const now = deps.now ?? new Date();

  if (!args.projectId || typeof args.projectId !== "string") {
    throw new Error("projectId is required");
  }
  const weeks = clampWeeks(args.weeksAhead, 4);

  const ownership = await query(
    `SELECT 1 FROM vybe_projects WHERE id = $1 AND user_email = $2`,
    [args.projectId, ctx.userId],
  );
  if (ownership.length === 0) throw new Error("Project not found or not accessible");

  const taskRows = await query(
    `SELECT title, description, deadline, estimated_minutes, priority
       FROM pulse_tasks
      WHERE project_id = $1 AND user_email = $2
        AND status <> 'completed' AND status <> 'done'
      ORDER BY deadline ASC NULLS LAST`,
    [args.projectId, ctx.userId],
  );
  const fileRows = await query(
    `SELECT filename FROM vybe_project_files WHERE project_id = $1 AND user_email = $2 ORDER BY uploaded_at DESC`,
    [args.projectId, ctx.userId],
  );
  const noteRows = await query(
    `SELECT title FROM vybe_project_notes WHERE project_id = $1 AND user_email = $2 ORDER BY updated_at DESC`,
    [args.projectId, ctx.userId],
  );

  const planCtx: PlanContext = {
    tasks: taskRows.map((r) => {
      const minutes = Number((r as Record<string, unknown>).estimated_minutes ?? 0);
      const deadlineRaw = (r as Record<string, unknown>).deadline as string | Date | null;
      const deadline =
        deadlineRaw instanceof Date
          ? deadlineRaw.toISOString()
          : typeof deadlineRaw === "string" && deadlineRaw
            ? new Date(deadlineRaw).toISOString()
            : null;
      return {
        title: ((r as Record<string, unknown>).title as string) ?? "(untitled)",
        description: ((r as Record<string, unknown>).description as string | null) ?? null,
        deadline,
        estimatedHours: Math.max(1, Math.round(minutes / 60)),
        priority: ((r as Record<string, unknown>).priority as string) ?? "Medium",
      };
    }),
    fileTitles: fileRows.map((r) => ((r as Record<string, unknown>).filename as string) ?? "(unnamed)"),
    noteTitles: noteRows
      .map((r) => ((r as Record<string, unknown>).title as string | null) ?? null)
      .filter((t): t is string => !!t && t.trim().length > 0),
  };

  if (planCtx.tasks.length === 0 && planCtx.fileTitles.length === 0 && planCtx.noteTitles.length === 0) {
    return "No tasks, files, or notes in this project yet. Add some content first, then generate a study plan.";
  }

  const plan = await ctx.aiGenerate(buildPrompt(weeks, planCtx));
  if (!plan.trim()) throw new Error("Empty study plan returned by the model");

  const title = `Study plan (${now.toISOString().slice(0, 10)})`;
  await query(
    `INSERT INTO vybe_project_notes (project_id, user_email, title, content_markdown)
     VALUES ($1, $2, $3, $4)`,
    [args.projectId, ctx.userId, title, plan],
  );

  return `Study plan saved as note: ${title}`;
}

export const generateStudyPlanTool: AgentTool = {
  name: "generate_study_plan",
  description:
    "Generate a week-by-week study plan from the project's incomplete tasks and resources, saved as a note. Args: { projectId: string, weeksAhead?: number (1-12, default 4) }.",
  async run(args, ctx) {
    if (!ctx.projectId) throw new Error("generate_study_plan requires a project context");
    const projectId = typeof args.projectId === "string" ? args.projectId : ctx.projectId;
    const weeksAhead = typeof args.weeksAhead === "number" ? args.weeksAhead : undefined;
    return runGenerateStudyPlan({ projectId, weeksAhead }, ctx);
  },
};
