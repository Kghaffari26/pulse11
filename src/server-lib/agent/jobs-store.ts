import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import type { AgentJob, AgentJobStatus, AgentStep } from "@/shared/models/ai";

function rowToJob(row: Record<string, unknown>): AgentJob {
  const parseJson = <T>(v: unknown, fallback: T): T => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === "string") {
      try {
        return JSON.parse(v) as T;
      } catch {
        return fallback;
      }
    }
    return v as T;
  };
  return {
    id: row.id as string,
    userEmail: row.user_email as string,
    status: row.status as AgentJobStatus,
    goal: row.goal as string,
    context: parseJson<Record<string, unknown> | null>(row.context, null),
    steps: parseJson<AgentStep[]>(row.steps, []),
    output: parseJson<Record<string, unknown> | null>(row.output, null),
    error: (row.error as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export interface JobsStore {
  create(userId: string, goal: string, context: Record<string, unknown> | null): Promise<AgentJob>;
  get(id: string, userId: string): Promise<AgentJob | null>;
  getForExecutor(id: string): Promise<AgentJob | null>;
  updateStatus(id: string, status: AgentJobStatus, patch?: JobStatusPatch): Promise<void>;
  setSteps(id: string, steps: AgentStep[]): Promise<void>;
}

export interface JobStatusPatch {
  output?: Record<string, unknown> | null;
  error?: string | null;
}

export const defaultJobsStore: JobsStore = {
  async create(userId, goal, context) {
    const rows = await queryInternalDatabase(
      `INSERT INTO vybe_agent_jobs (user_email, status, goal, context)
       VALUES ($1, 'queued', $2, $3)
       RETURNING *`,
      [userId, goal, context ? JSON.stringify(context) : null],
    );
    return rowToJob(rows[0] as Record<string, unknown>);
  },
  async get(id, userId) {
    const rows = await queryInternalDatabase(
      `SELECT * FROM vybe_agent_jobs WHERE id = $1 AND user_email = $2`,
      [id, userId],
    );
    return rows[0] ? rowToJob(rows[0] as Record<string, unknown>) : null;
  },
  async getForExecutor(id) {
    const rows = await queryInternalDatabase(
      `SELECT * FROM vybe_agent_jobs WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToJob(rows[0] as Record<string, unknown>) : null;
  },
  async updateStatus(id, status, patch) {
    await queryInternalDatabase(
      `UPDATE vybe_agent_jobs
         SET status = $2,
             output = COALESCE($3::jsonb, output),
             error  = COALESCE($4, error),
             updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        status,
        patch?.output !== undefined ? JSON.stringify(patch.output) : null,
        patch?.error ?? null,
      ],
    );
  },
  async setSteps(id, steps) {
    await queryInternalDatabase(
      `UPDATE vybe_agent_jobs SET steps = $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(steps)],
    );
  },
};
