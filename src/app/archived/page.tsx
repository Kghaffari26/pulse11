"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mutate } from "swr";
import {
  undoCompleteTask,
  useArchivedTasks,
} from "@/client-lib/api-client";
import { useProjects } from "@/client-lib/projects-client";
import type { Task } from "@/shared/models/pulse";
import type { Project } from "@/shared/models/projects";

function parseDateBoundary(value: string, endOfDay = false): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function taskCompletedMs(t: Task): number {
  return t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.updatedAt).getTime();
}

export default function ArchivedPage() {
  const { data: tasks, isLoading } = useArchivedTasks();
  const { data: projects } = useProjects({ includeArchived: true });
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects ?? []) map.set(p.id, p);
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = parseDateBoundary(from, false);
    const toMs = parseDateBoundary(to, true);
    return (tasks ?? []).filter((t) => {
      if (projectFilter !== "all") {
        if (projectFilter === "none") {
          if (t.projectId) return false;
        } else if (t.projectId !== projectFilter) {
          return false;
        }
      }
      const ms = taskCompletedMs(t);
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms > toMs) return false;
      if (q) {
        const hay = `${t.title} ${t.description ?? ""} ${t.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, projectFilter, from, to]);

  async function handleRestore(task: Task) {
    // Optimistic removal from archived list.
    await mutate(
      "/tasks?status=archived",
      (curr?: Task[]) => (curr ?? []).filter((t) => t.id !== task.id),
      { revalidate: false },
    );
    try {
      await undoCompleteTask(task.id);
      toast.success(`"${task.title}" restored`);
    } catch {
      toast.error("Couldn't restore task");
      await mutate("/tasks?status=archived");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Archived tasks</h1>
        <p className="text-sm text-muted-foreground">
          Completed tasks, reverse-chronological. Excluded from the active lists by default.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_220px_160px_160px]">
        <div className="space-y-1.5">
          <Label htmlFor="archived-search">Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="archived-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, description, notes…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              <SelectItem value="none">No project</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="archived-from">From</Label>
          <Input
            id="archived-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="archived-to">To</Label>
          <Input
            id="archived-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {(tasks?.length ?? 0) === 0
            ? "Nothing archived yet."
            : "No archived tasks match your filters."}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const project = t.projectId ? projectsById.get(t.projectId) : null;
            const completedAt = t.completedAt ? new Date(t.completedAt) : null;
            return (
              <Card key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {project && (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color ?? "#64748b" }}
                      />
                    )}
                    <span className="truncate font-medium">{t.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {project ? project.name : "No project"} ·{" "}
                    {completedAt
                      ? `Completed ${formatDistanceToNow(completedAt, { addSuffix: true })}`
                      : "Completed"}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleRestore(t)}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Restore
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
