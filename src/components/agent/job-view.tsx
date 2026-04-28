"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  Slash,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelAgentJob, isTerminal } from "@/client-lib/agent-client";
import type { AgentJob, AgentJobStatus, AgentStep } from "@/shared/models/ai";

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

interface Props {
  job: AgentJob;
  onReset?: () => void;
}

export function JobView({ job, onReset }: Props) {
  const [cancelling, setCancelling] = useState(false);
  const terminal = isTerminal(job.status);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelAgentJob(job.id);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed break-words">{job.goal}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!terminal && (
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Cancel
            </Button>
          )}
          {terminal && onReset && (
            <Button size="sm" variant="default" onClick={onReset}>
              Run another
            </Button>
          )}
        </div>
      </div>

      {job.error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1 break-words">{job.error}</span>
        </div>
      )}

      <StepList steps={job.steps} />
    </div>
  );
}

function StepList({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Planning…
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <StepRow key={i} index={i} step={s} />
      ))}
    </ol>
  );
}

function StepRow({ index, step }: { index: number; step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const hasOutput = step.output && step.output.trim().length > 0;
  return (
    <li className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => hasOutput && setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
        disabled={!hasOutput}
      >
        <StepIcon status={step.status} />
        <span className="flex-1 break-words">
          <span className="text-xs text-muted-foreground mr-2">Step {index + 1}</span>
          {step.step}
        </span>
        {hasOutput ? (
          open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </button>
      {open && hasOutput && (
        <pre className="whitespace-pre-wrap break-words border-t bg-muted/30 px-3 py-2 text-xs">
          {step.output}
        </pre>
      )}
    </li>
  );
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "completed") return <Check className="h-4 w-4 text-emerald-600" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "failed") return <X className="h-4 w-4 text-destructive" />;
  if (status === "pending") return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
  return <Slash className="h-4 w-4 text-muted-foreground" />;
}
