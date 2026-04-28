"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Copy,
  Loader2,
  Slash,
  Wrench,
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
  const hasOutput = !!(step.output && step.output.trim().length > 0);
  const isTool = !!step.tool;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!step.output) return;
    try {
      await navigator.clipboard.writeText(step.output);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — clipboard unavailable");
    }
  };

  return (
    <li className="group rounded-md border bg-background">
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
        {isTool && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Wrench className="h-2.5 w-2.5" />
            {step.tool}
          </span>
        )}
        {hasOutput ? (
          open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </button>
      {open && hasOutput && (
        <div className="relative border-t bg-muted/30">
          {!isTool && (
            <button
              type="button"
              onClick={handleCopy}
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
              aria-label="Copy step output"
              title="Copy"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {isTool ? (
            <pre className="whitespace-pre-wrap break-words px-3 py-2 text-xs">{step.output}</pre>
          ) : (
            <div className="prose prose-sm max-w-none px-3 py-2 text-sm dark:prose-invert prose-p:my-2 prose-headings:mb-2 prose-headings:mt-3 prose-headings:font-semibold prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
              <ReactMarkdown>{step.output ?? ""}</ReactMarkdown>
            </div>
          )}
        </div>
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
