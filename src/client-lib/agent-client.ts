import useSWR, { mutate } from "swr";
import { apiClient } from "./api-client";
import type { AgentJob, AgentJobStatus } from "@/shared/models/ai";

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

export interface JobsListResponse {
  jobs: AgentJob[];
  total: number;
  page: number;
  pageSize: number;
}

const TERMINAL: ReadonlySet<AgentJobStatus> = new Set(["completed", "failed", "cancelled"]);
export function isTerminal(status: AgentJobStatus | undefined): boolean {
  return status !== undefined && TERMINAL.has(status);
}

/** Polls the job detail every 1500ms until the job reaches a terminal state. */
export function useAgentJob(jobId: string | null | undefined) {
  return useSWR<AgentJob, Error>(
    jobId ? `/agent/jobs/${jobId}` : null,
    fetcher,
    {
      refreshInterval: (data) => (isTerminal(data?.status) ? 0 : 1500),
      revalidateOnFocus: false,
    },
  );
}

export interface JobsListParams {
  page?: number;
  status?: AgentJobStatus | "all";
}

export function useAgentJobs(params: JobsListParams = {}) {
  const search = new URLSearchParams();
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.status && params.status !== "all") search.set("status", params.status);
  const qs = search.toString();
  const key = qs ? `/agent/jobs?${qs}` : "/agent/jobs";
  return useSWR<JobsListResponse, Error>(key, fetcher, { refreshInterval: 5000 });
}

export async function startAgentJob(opts: {
  goal: string;
  projectId?: string | null;
  fileIds?: string[];
}): Promise<{ jobId: string }> {
  const context: Record<string, unknown> = {};
  if (opts.projectId) context.projectId = opts.projectId;
  if (opts.fileIds && opts.fileIds.length > 0) context.fileIds = opts.fileIds;

  const res = await apiClient.post<{ jobId: string }>("/agent/run", {
    goal: opts.goal,
    context: Object.keys(context).length > 0 ? context : undefined,
  });
  return res.data;
}

export async function cancelAgentJob(jobId: string): Promise<void> {
  await apiClient.post(`/agent/jobs/${jobId}/cancel`);
  await mutate(`/agent/jobs/${jobId}`);
}
