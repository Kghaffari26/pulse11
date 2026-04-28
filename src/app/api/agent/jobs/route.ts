import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import type { AgentJob, AgentJobStatus, AgentStep } from "@/shared/models/ai";

export const runtime = "nodejs";

const STATUS_FILTERS: ReadonlySet<AgentJobStatus | "all" | "running"> = new Set([
  "all",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const);

const PAGE_SIZE = 20;
const MAX_PAGE = 50;

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

/**
 * List the caller's agent jobs, newest first. Pagination is page-based
 * (1-indexed) at PAGE_SIZE=20 to match the UI's row count. The total
 * count is returned so the activity log can render "page 2 of 5".
 */
export async function GET(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const url = new URL(req.url);
  const statusParam = (url.searchParams.get("status") ?? "all").toLowerCase();
  const status = STATUS_FILTERS.has(statusParam as AgentJobStatus | "all")
    ? statusParam
    : "all";

  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Math.max(1, Math.min(MAX_PAGE, Number.isFinite(pageParam) ? pageParam : 1));
  const offset = (page - 1) * PAGE_SIZE;

  const where = status === "all"
    ? `WHERE user_email = $1`
    : `WHERE user_email = $1 AND status = $2`;
  const params = status === "all" ? [userId] : [userId, status];

  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_agent_jobs ${where} ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );
  const totalRows = await queryInternalDatabase(
    `SELECT COUNT(*)::int AS n FROM vybe_agent_jobs ${where}`,
    params,
  );
  const total = (totalRows[0] as { n?: number } | undefined)?.n ?? 0;

  return NextResponse.json({
    jobs: rows.map((r) => rowToJob(r as Record<string, unknown>)),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
