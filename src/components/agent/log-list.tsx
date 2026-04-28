"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JobView } from "./job-view";
import { useAgentJobs } from "@/client-lib/agent-client";
import type { AgentJob, AgentJobStatus } from "@/shared/models/ai";

const STATUS_FILTERS: Array<{ value: AgentJobStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_VARIANT: Record<AgentJobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  running: "default",
  completed: "default",
  failed: "destructive",
  cancelled: "outline",
};

const STATUS_LABEL: Record<AgentJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

function isTerminalStatus(s: AgentJobStatus): boolean {
  return s === "completed" || s === "failed" || s === "cancelled";
}

export function LogList() {
  const [status, setStatus] = useState<AgentJobStatus | "all">("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAgentJobs({ status, page });
  const [expanded, setExpanded] = useState<string | null>(null);

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as AgentJobStatus | "all");
            setPage(1);
            setExpanded(null);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {total} run{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && jobs.length === 0 && <EmptyState />}

      {!isLoading && jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <LogRow
              key={job.id}
              job={job}
              isExpanded={expanded === job.id}
              onToggle={() => setExpanded((curr) => (curr === job.id ? null : job.id))}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function LogRow({
  job,
  isExpanded,
  onToggle,
}: {
  job: AgentJob;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const duration = isTerminalStatus(job.status) ? formatDuration(job.createdAt, job.updatedAt) : "—";
  return (
    <li className="rounded-md border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-sm">{truncate(job.goal, 80)}</span>
        <Badge variant={STATUS_VARIANT[job.status]} className="shrink-0">
          {STATUS_LABEL[job.status]}
        </Badge>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {job.steps.length} step{job.steps.length === 1 ? "" : "s"}
        </span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{duration}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {new Date(job.createdAt).toLocaleDateString()}
        </span>
      </button>
      {isExpanded && (
        <div className="border-t p-3">
          <JobView job={job} />
        </div>
      )}
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center">
      <ListChecks className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No agent runs yet. Start one from{" "}
        <Link href="/agent/run" className="font-medium text-foreground underline-offset-4 hover:underline">
          Run Task
        </Link>
        .
      </p>
    </div>
  );
}
