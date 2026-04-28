export const GEMINI_KEY_PREFIX = "AIza";
export const GEMINI_KEY_LENGTH = 39;
export const FREE_TIER_MONTHLY_LIMIT = 20;

export type Validation<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: string; value?: undefined };

export function validateGeminiApiKey(input: unknown): Validation<string> {
  if (typeof input !== "string") return { ok: false, error: "API key must be a string" };
  const v = input.trim();
  if (v.length === 0) return { ok: false, error: "API key is required" };
  if (!v.startsWith(GEMINI_KEY_PREFIX)) {
    return { ok: false, error: `Gemini API keys start with "${GEMINI_KEY_PREFIX}"` };
  }
  if (v.length !== GEMINI_KEY_LENGTH) {
    return { ok: false, error: `Gemini API keys are ${GEMINI_KEY_LENGTH} characters (got ${v.length})` };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(v)) {
    return { ok: false, error: "API key contains invalid characters" };
  }
  return { ok: true, value: v };
}

/** yyyymm bucket for the free-tier counter. */
export function currentYyyymm(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface AgentStep {
  step: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  /** Tool name when this step dispatched through AGENT_TOOLS; absent for
   *  pure text-generation steps. Lets the UI branch on output rendering
   *  (markdown prose for text, monospace for structured tool returns). */
  tool?: string;
  startedAt?: string;
  completedAt?: string;
}

export type AgentJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentJob {
  id: string;
  userEmail: string;
  status: AgentJobStatus;
  goal: string;
  context: Record<string, unknown> | null;
  steps: AgentStep[];
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const AGENT_GOAL_MAX = 2000;

export function validateAgentGoal(input: unknown): Validation<string> {
  if (typeof input !== "string") return { ok: false, error: "goal must be a string" };
  const v = input.trim();
  if (v.length === 0) return { ok: false, error: "goal is required" };
  if (v.length > AGENT_GOAL_MAX) {
    return { ok: false, error: `goal must be <= ${AGENT_GOAL_MAX} characters` };
  }
  return { ok: true, value: v };
}
