import { aiGenerate } from "@/server-lib/ai-generate";
import type { AgentStep } from "@/shared/models/ai";
import { defaultJobsStore, type JobsStore } from "./jobs-store";

export interface ExecutorDeps {
  jobsStore?: JobsStore;
  /** Called once per step; pure wrapper around aiGenerate so tests can stub. */
  generate?: (userId: string, prompt: string) => Promise<string>;
}

const MIN_STEPS = 3;
const MAX_STEPS = 7;
const PLAN_PROMPT = (goal: string) =>
  `You are an AI planning agent. Break the user's goal into ${MIN_STEPS}-${MAX_STEPS} concrete, ordered steps. ` +
  `Return ONLY a JSON array of strings, no prose, no markdown fences. Each string is one step.\n\n` +
  `Goal: ${goal}`;

const STEP_PROMPT = (goal: string, step: string, priorOutputs: string[]) =>
  `You are an AI planning agent. The user's goal is: ${goal}\n\n` +
  (priorOutputs.length > 0 ? `Prior step outputs:\n${priorOutputs.map((o, i) => `[step ${i + 1}] ${o}`).join("\n\n")}\n\n` : "") +
  `Produce the output for the next step:\n${step}\n\n` +
  `Respond with the step result directly. Keep it concise and useful.`;

function parsePlan(raw: string): string[] {
  // Tolerate leading/trailing fences or prose — find the outermost JSON array.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const steps = parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      return steps.slice(0, MAX_STEPS);
    }
  } catch {
    // fallthrough
  }
  // Fallback: split by newline and strip bullets/numbering.
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, MAX_STEPS);
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

  const job = await jobsStore.getForExecutor(jobId);
  if (!job) return;
  if (job.status !== "queued") return; // Already handled.

  await jobsStore.updateStatus(jobId, "running");

  try {
    // Planning
    const planText = await generate(job.userEmail, PLAN_PROMPT(job.goal));
    const planned = parsePlan(planText);
    if (planned.length < MIN_STEPS) {
      await jobsStore.updateStatus(jobId, "failed", {
        error: `Planner returned ${planned.length} step(s); need at least ${MIN_STEPS}. Raw: ${planText.slice(0, 200)}`,
      });
      return;
    }

    const steps: AgentStep[] = planned.map((s) => ({ step: s, status: "pending" }));
    await jobsStore.setSteps(jobId, steps);

    const priorOutputs: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      // Cancellation check between steps.
      const fresh = await jobsStore.getForExecutor(jobId);
      if (!fresh || fresh.status === "cancelled") return;

      steps[i] = { ...steps[i], status: "running", startedAt: new Date().toISOString() };
      await jobsStore.setSteps(jobId, steps);

      try {
        const output = await generate(job.userEmail, STEP_PROMPT(job.goal, steps[i].step, priorOutputs));
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
