"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useTasks } from "@/client-lib/api-client";
import { TaskCard } from "@/components/pulse/task-card";
import { TaskDetailPanel } from "@/components/pulse/task-detail-panel";
import { isTaskCompleted } from "@/shared/models/pulse";

export function ProjectTasksPanel({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (projectTasks.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No tasks in this project yet. Assign existing tasks via the detail panel.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {active.length} active · {done.length} completed
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
