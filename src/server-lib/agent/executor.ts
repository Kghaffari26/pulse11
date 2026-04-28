import { aiGenerate } from "@/server-lib/ai-generate";
import type { AgentStep } from "@/shared/models/ai";
import { defaultJobsStore, type JobsStore } from "./jobs-store";
import {
  AGENT_TOOLS,
  getTool,
  makeBoundAiGenerate,
  type AgentToolContext,
} from "./tools";

export interface PlannedStep {
  step: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export interface ExecutorDeps {
  jobsStore?: JobsStore;
  /** Called once per text step; pure wrapper around aiGenerate so tests can stub. */
  generate?: (userId: string, prompt: string) => Promise<string>;
  /** Tool dispatcher; tests stub to assert routing without running real tools. */
  runTool?: (name: string, args: Record<string, unknown>, ctx: AgentToolContext) => Promise<string>;
}

const MIN_STEPS = 3;
const MAX_STEPS = 7;

const TOOL_CATALOG = () =>
  AGENT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n") || "(no tools available)";

const PLAN_PROMPT = (goal: string, projectId: string | null) =>
  `You are an AI planning agent. Break the user's goal into ${MIN_STEPS}-${MAX_STEPS} concrete, ordered steps.\n\n` +
  `Available tools (use only when appropriate):\n${TOOL_CATALOG()}\n\n` +
  `Output a JSON array. Each item is either a plain string (a text-only reasoning step) ` +
  `or an object {"step": "...", "tool": "tool_name", "args": {...}} when the step should invoke a tool. ` +
  `Tool args must be a flat JSON object containing the parameters that tool documents. ` +
  `Return ONLY the JSON array, no prose, no markdown fences.\n\n` +
  (projectId ? `Project id (pass as projectId in tool args when needed): ${projectId}\n\n` : "") +
  `Goal: ${goal}`;

const STEP_PROMPT = (goal: string, step: string, priorOutputs: string[]) =>
  `You are an AI planning agent. The user's goal is: ${goal}\n\n` +
  (priorOutputs.length > 0 ? `Prior step outputs:\n${priorOutputs.map((o, i) => `[step ${i + 1}] ${o}`).join("\n\n")}\n\n` : "") +
  `Produce the output for the next step:\n${step}\n\n` +
  `Respond with the step result directly. Keep it concise and useful.`;

/**
 * Strip leading/trailing markdown fences and surrounding prose, then parse JSON.
 * Tolerates the most common LLM output shapes — fenced JSON, JSON wrapped in
 * a single explanation paragraph, or a numbered list as a last-resort fallback.
 */
export function parsePlan(raw: string): PlannedStep[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();

  const tryParse = (text: string): PlannedStep[] | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return null;
      const steps: PlannedStep[] = [];
      for (const item of parsed) {
        if (typeof item === "string") {
          if (item.trim().length > 0) steps.push({ step: item.trim() });
        } else if (item && typeof item === "object" && !Array.isArray(item)) {
          const obj = item as Record<string, unknown>;
          const stepText = typeof obj.step === "string" ? obj.step.trim() : "";
          if (!stepText) continue;
          const tool = typeof obj.tool === "string" && obj.tool.trim() ? obj.tool.trim() : undefined;
          const args =
            obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
              ? (obj.args as Record<string, unknown>)
              : undefined;
          steps.push({ step: stepText, ...(tool ? { tool } : {}), ...(args ? { args } : {}) });
        }
      }
      return steps;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct && direct.length > 0) return direct.slice(0, MAX_STEPS);

  // Some models wrap the array in narrative text; grab the first array literal.
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) {
    const fromMatch = tryParse(match[0]);
    if (fromMatch && fromMatch.length > 0) return fromMatch.slice(0, MAX_STEPS);
  }

  // Fallback: split by newline, strip bullets/numbering — only produces text steps.
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, MAX_STEPS).map((step) => ({ step }));
}

/**
 * Run a job to completion. Safe to invoke from setImmediate after
 * POST /api/agent/run returns; the function never throws to the caller,
 * it records failure in the job row instead.
 *
 * Cancellation: between steps we reload the row and bail out if the user
 * flipped status to 'cancelled' via the cancel endpoint.
 */
export async function runAgentJob(jobId: string, deps: ExecutorDeps = {}): Promise<void> {
  const jobsStore = deps.jobsStore ?? defaultJobsStore;
  const generate =
    deps.generate ??
    (async (userId: string, prompt: string) => {
      const r = await aiGenerate({ userId, prompt });
      if (!r.ok) throw new Error(r.error);
      return r.text;
    });
  const runTool =
    deps.runTool ??
    (async (name, args, ctx) => {
      const tool = getTool(name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      return tool.run(args, ctx);
    });

  const job = await jobsStore.getForExecutor(jobId);
  if (!job) return;
  if (job.status !== "queued") return; // Already handled.

  await jobsStore.updateStatus(jobId, "running");

  // Surface the project id from the job context so tools can scope to it.
  const projectId =
    job.context && typeof job.context.projectId === "string"
      ? (job.context.projectId as string)
      : null;

  try {
    const planText = await generate(job.userEmail, PLAN_PROMPT(job.goal, projectId));
    const planned = parsePlan(planText);
    if (planned.length < MIN_STEPS) {
      await jobsStore.updateStatus(jobId, "failed", {
        error: `Planner returned ${planned.length} step(s); need at least ${MIN_STEPS}. Raw: ${planText.slice(0, 200)}`,
      });
      return;
    }

    const steps: AgentStep[] = planned.map((p) => ({ step: p.step, status: "pending" }));
    await jobsStore.setSteps(jobId, steps);

    const toolCtx: AgentToolContext = {
      userId: job.userEmail,
      projectId: projectId ?? undefined,
      aiGenerate: makeBoundAiGenerate(job.userEmail),
    };

    const priorOutputs: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const fresh = await jobsStore.getForExecutor(jobId);
      if (!fresh || fresh.status === "cancelled") return;

      steps[i] = { ...steps[i], status: "running", startedAt: new Date().toISOString() };
      await jobsStore.setSteps(jobId, steps);

      try {
        const planStep = planned[i];
        let output: string;
        if (planStep.tool) {
          // Tools resolve their own args; the planner must include any project
          // or file ids the tool needs, but we also fall back to the job's
          // projectId when the planner omits it.
          const args = {
            ...(planStep.args ?? {}),
            ...(projectId && !(planStep.args && "projectId" in planStep.args)
              ? { projectId }
              : {}),
          };
          output = await runTool(planStep.tool, args, toolCtx);
        } else {
          output = await generate(job.userEmail, STEP_PROMPT(job.goal, steps[i].step, priorOutputs));
        }
        steps[i] = {
          ...steps[i],
          status: "completed",
          output,
          completedAt: new Date().toISOString(),
        };
        priorOutputs.push(output);
        await jobsStore.setSteps(jobId, steps);
      } catch (err) {
        steps[i] = {
          ...steps[i],
          status: "failed",
          output: err instanceof Error ? err.message : "Step failed",
          completedAt: new Date().toISOString(),
        };
        await jobsStore.setSteps(jobId, steps);
        await jobsStore.updateStatus(jobId, "failed", {
          error: err instanceof Error ? err.message : "Step failed",
        });
        return;
      }
    }

    await jobsStore.updateStatus(jobId, "completed", {
      output: {
        summary: priorOutputs[priorOutputs.length - 1] ?? "",
        stepCount: steps.length,
      },
    });
  } catch (err) {
    await jobsStore.updateStatus(jobId, "failed", {
      error: err instanceof Error ? err.message : "Agent failed",
    });
  }
}
