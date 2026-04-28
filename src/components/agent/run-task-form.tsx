"use client";

import { useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AILocked } from "@/components/ai/ai-locked";
import { JobView } from "./job-view";
import { startAgentJob, useAgentJob } from "@/client-lib/agent-client";
import { useProjects } from "@/client-lib/projects-client";
import { useProjectFiles } from "@/client-lib/files-client";
import { AGENT_GOAL_MAX } from "@/shared/models/ai";

const NO_PROJECT = "__none";

export function RunTaskForm() {
  const [goal, setGoal] = useState("");
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: projects } = useProjects();
  const activeProjects = (projects ?? []).filter((p) => !p.archived);
  const projectScoped = projectId !== NO_PROJECT ? projectId : null;
  const { data: filesResp } = useProjectFiles(projectScoped);
  const projectFiles = filesResp?.files ?? [];

  const { data: activeJob } = useAgentJob(activeJobId);

  const canRun = goal.trim().length > 0 && !submitting && !activeJobId;

  const handleProjectChange = (value: string) => {
    setProjectId(value);
    setSelectedFileIds([]);
  };

  const toggleFile = (id: string) => {
    setSelectedFileIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { jobId } = await startAgentJob({
        goal: goal.trim(),
        projectId: projectScoped,
        fileIds: selectedFileIds,
      });
      setActiveJobId(jobId);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setSubmitError(e.response?.data?.error ?? e.message ?? "Failed to queue agent run");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setActiveJobId(null);
    setSubmitError(null);
    setGoal("");
    setSelectedFileIds([]);
  };

  return (
    <div className="space-y-6">
      {!activeJobId && (
        <div className="space-y-4">
          <AILocked>
            <div className="space-y-2">
              <label htmlFor="goal" className="text-sm font-medium">
                Goal
              </label>
              <Textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value.slice(0, AGENT_GOAL_MAX))}
                placeholder="What do you want the agent to do? (e.g., 'Extract tasks from my Econ syllabus' or 'Summarize the assigned reading')"
                rows={4}
                className="resize-none"
              />
              <div className="text-right text-xs text-muted-foreground">
                {goal.length} / {AGENT_GOAL_MAX}
              </div>
            </div>
          </AILocked>

          <div className="space-y-2">
            <label htmlFor="project" className="text-sm font-medium">
              Project (optional)
            </label>
            <Select value={projectId} onValueChange={handleProjectChange}>
              <SelectTrigger id="project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project (general task)</SelectItem>
                {activeProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {projectScoped && projectFiles.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Files (optional, multi-select)</label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {projectFiles.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(f.id)}
                      onChange={() => toggleFile(f.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate">{f.filename}</span>
                  </label>
                ))}
              </div>
              {selectedFileIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedFileIds.length} file{selectedFileIds.length === 1 ? "" : "s"} selected
                </p>
              )}
            </div>
          )}

          {submitError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!canRun}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run agent
            </Button>
          </div>
        </div>
      )}

      {activeJobId && activeJob && (
        <JobView job={activeJob} onReset={handleReset} />
      )}
      {activeJobId && !activeJob && (
        <div className="flex items-center gap-2 rounded-md border bg-card p-4 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Connecting to agent…
        </div>
      )}
    </div>
  );
}
