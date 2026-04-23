"use client";

import { useState } from "react";
import { Clock, Flame, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle, Play, Calendar, Sparkles } from "lucide-react";
import { AIAssistDialog } from "./ai-assist-dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { mutate } from "swr";
import {
  completeTask,
  deleteTask,
  deleteSubtask,
  undoCompleteTask,
  updateSubtask,
  regenerateSessions,
} from "@/client-lib/api-client";
import {
  computeUrgency,
  formatDuration,
  formatRemaining,
  isTaskCompleted,
  urgencyBar,
  urgencyColor,
  type Task,
  type TaskStatus,
} from "@/shared/models/pulse";
import { cn } from "@/shared/utils";

function applyOptimisticStatus(
  taskId: string,
  status: TaskStatus,
  completedAt: string | null,
) {
  return mutate(
    "/tasks",
    (tasks?: Task[]) =>
      (tasks ?? []).map((t) => (t.id === taskId ? { ...t, status, completedAt } : t)),
    { revalidate: false },
  );
}

interface Props {
  task: Task;
  now: Date;
  onOpenDetail?: (taskId: string) => void;
}

export function TaskCard({ task, now, onOpenDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const urgency = computeUrgency(task, now);
  const progress = task.estimatedMinutes > 0 ? Math.min(100, (task.completedMinutes / task.estimatedMinutes) * 100) : 0;
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const isDone = isTaskCompleted(task);

  const toggleDone = async () => {
    if (isDone) {
      // Reopen: no undo ceremony, just flip it back.
      await applyOptimisticStatus(task.id, "pending", null);
      try {
        await undoCompleteTask(task.id);
        toast.success("Task reopened");
      } catch {
        toast.error("Couldn't reopen task");
        await mutate("/tasks");
      }
      return;
    }

    // Complete: optimistic removal from active list + 5s undo toast.
    const nowIso = new Date().toISOString();
    await applyOptimisticStatus(task.id, "completed", nowIso);
    try {
      await completeTask(task.id);
    } catch {
      toast.error("Couldn't complete task");
      await mutate("/tasks");
      return;
    }

    toast.success(`"${task.title}" completed`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: async () => {
          await applyOptimisticStatus(task.id, "pending", null);
          try {
            await undoCompleteTask(task.id);
            toast.success("Task restored");
          } catch {
            toast.error("Couldn't undo");
            await mutate("/tasks");
          }
        },
      },
    });
  };

  const planSessions = async () => {
    try {
      await regenerateSessions(task.id);
      toast.success("Focus sessions generated");
    } catch {
      toast.error("Couldn't generate sessions");
    }
  };

  const handleDeleteTask = async () => {
    try {
      await deleteTask(task.id);
    } catch {
      toast.error("Couldn't delete task");
    }
  };

  const handleToggleSubtask = async (subId: string, nextDone: boolean) => {
    try {
      await updateSubtask(subId, { done: nextDone });
    } catch {
      toast.error("Couldn't update subtask");
    }
  };

  const handleDeleteSubtask = async (subId: string) => {
    try {
      await deleteSubtask(subId);
    } catch {
      toast.error("Couldn't delete subtask");
    }
  };

  return (
    <Card className={cn("overflow-hidden transition-all", isDone && "opacity-60")}>
      <div className={cn("h-1 w-full", urgencyBar(urgency.level))} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={toggleDone} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
            {isDone ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {onOpenDetail ? (
                  <button
                    type="button"
                    onClick={() => onOpenDetail(task.id)}
                    className={cn(
                      "block w-full truncate text-left font-semibold leading-tight hover:underline",
                      isDone && "line-through",
                    )}
                  >
                    {task.title}
                  </button>
                ) : (
                  <h3 className={cn("font-semibold leading-tight", isDone && "line-through")}>{task.title}</h3>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{task.category}</Badge>
                  <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
                  {!isDone && (
                    <Badge className={cn("text-[10px]", urgencyColor(urgency.level))}>
                      <Flame className="mr-1 h-3 w-3" />
                      {urgency.label}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <AIAssistDialog
                  task={task}
                  trigger={
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" title="AI Assist">
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  }
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete task?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteTask}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
              <div>
                <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Due in</div>
                <div className="mt-0.5 font-medium text-foreground">{formatRemaining(urgency.minutesRemaining)}</div>
              </div>
              <div>
                <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Needs</div>
                <div className="mt-0.5 font-medium text-foreground">{formatDuration(Math.max(0, task.estimatedMinutes - task.completedMinutes))}</div>
              </div>
              <div>
                <div>Urgency</div>
                <div className="mt-0.5 font-medium text-foreground">{Math.round(urgency.score)}</div>
              </div>
            </div>

            {progress > 0 && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/80 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {formatDuration(task.completedMinutes)} of {formatDuration(task.estimatedMinutes)} done
                </div>
              </div>
            )}

            {(task.subtasks.length > 0 || task.sessions.length > 0 || task.notes) && (
              <button
                className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {task.subtasks.length > 0 && <span>{doneSubs}/{task.subtasks.length} subtasks</span>}
                {task.sessions.length > 0 && <span>· {task.sessions.length} sessions</span>}
                {task.notes && <span>· notes</span>}
              </button>
            )}

            {expanded && (
              <div className="mt-3 space-y-3 border-t pt-3">
                {task.subtasks.length > 0 && (
                  <ul className="space-y-1">
                    {task.subtasks.map((s) => (
                      <li key={s.id} className="group flex items-center gap-2 text-sm">
                        <button
                          onClick={() => handleToggleSubtask(s.id, !s.done)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
                        </button>
                        <span className={cn("flex-1", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                        <button
                          onClick={() => handleDeleteSubtask(s.id)}
                          className="opacity-0 text-muted-foreground hover:text-foreground group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {task.notes && (
                  <div className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground whitespace-pre-wrap">{task.notes}</div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={planSessions}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    {task.sessions.length ? "Regenerate" : "Plan"} focus sessions
                  </Button>
                </div>

                {task.sessions.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Scheduled sessions</div>
                    {task.sessions.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
                        <span>{new Date(s.startAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        <span className="text-muted-foreground">
                          {formatDuration(s.durationMinutes)} work · {s.breakMinutes}m break
                          {s.completed && " · ✓"}
                        </span>
                      </div>
                    ))}
                    {task.sessions.length > 5 && (
                      <div className="text-[11px] text-muted-foreground">+{task.sessions.length - 5} more</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
