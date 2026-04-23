"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePrefs, useTasks } from "@/client-lib/api-client";
import { TaskCard } from "@/components/pulse/task-card";
import { TaskDetailPanel } from "@/components/pulse/task-detail-panel";
import { TaskDialog } from "@/components/pulse/task-dialog";
import { isTaskCompleted } from "@/shared/models/pulse";

export function ProjectTasksPanel({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks();
  const { data: prefs } = usePrefs();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const mode = prefs?.mode ?? "student";

  const projectTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.projectId === projectId),
    [tasks, projectId],
  );
  const active = projectTasks.filter((t) => !isTaskCompleted(t));
  const done = projectTasks.filter((t) => isTaskCompleted(t));

  const selectedTask = useMemo(
    () => projectTasks.find((t) => t.id === selectedTaskId) ?? null,
    [projectTasks, selectedTaskId],
  );

  const addTaskTrigger = (
    <Button size="sm">
      <Plus className="mr-1.5 h-4 w-4" />
      Add task
    </Button>
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (projectTasks.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <TaskDialog mode={mode} defaultProjectId={projectId} trigger={addTaskTrigger} />
        </div>
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No tasks in this project yet. Add one above, or assign existing tasks via the detail panel.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {active.length} active · {done.length} completed
        </div>
        <TaskDialog mode={mode} defaultProjectId={projectId} trigger={addTaskTrigger} />
      </div>
      <div className="space-y-3">
        {active.map((t) => (
          <TaskCard key={t.id} task={t} now={now} onOpenDetail={setSelectedTaskId} />
        ))}
        {done.map((t) => (
          <TaskCard key={t.id} task={t} now={now} onOpenDetail={setSelectedTaskId} />
        ))}
      </div>
      <TaskDetailPanel
        task={selectedTask}
        open={selectedTaskId != null}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
