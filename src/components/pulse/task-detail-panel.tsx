"use client";

import { useEffect, useState } from "react";
import { FileText, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import {
  addSubtask,
  deleteSubtask,
  updateSubtask,
  updateTask,
  useTaskFiles,
} from "@/client-lib/api-client";
import { useProjects } from "@/client-lib/projects-client";
import { formatBytes } from "@/shared/models/files";
import type { Task, TaskCategory, TaskPriority } from "@/shared/models/pulse";

const CATEGORIES: TaskCategory[] = ["School", "Work", "Certification", "Personal"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Critical"];

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

interface Props {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

export function TaskDetailPanel({ task, open, onClose }: Props) {
  const { data: projects } = useProjects({ includeArchived: false });
  const { data: files } = useTaskFiles(task?.id);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [deadline, setDeadline] = useState(toDateInputValue(task?.deadline));
  const [projectId, setProjectId] = useState<string | "none">(task?.projectId ?? "none");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "Medium");
  const [category, setCategory] = useState<TaskCategory>(task?.category ?? "Personal");
  const [newSubtask, setNewSubtask] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setDeadline(toDateInputValue(task.deadline));
      setProjectId(task.projectId ?? "none");
      setPriority(task.priority);
      setCategory(task.category);
    }
  }, [task?.id, task?.title, task?.description, task?.deadline, task?.projectId, task?.priority, task?.category]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function save<K extends string>(field: K, value: unknown) {
    if (!task) return;
    try {
      await updateTask(task.id, { [field]: value } as Partial<Task>);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? `Couldn't update ${field}`);
    }
  }

  async function handleAddSubtask() {
    if (!task || !newSubtask.trim()) return;
    try {
      await addSubtask(task.id, newSubtask.trim());
      setNewSubtask("");
    } catch {
      toast.error("Couldn't add subtask");
    }
  }

  return (
    <aside
      role="complementary"
      aria-label="Task details"
      aria-hidden={!open}
      className={`pointer-events-auto fixed right-0 top-0 z-40 flex h-screen w-[min(480px,100vw)] flex-col border-l bg-background shadow-xl transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Task details</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>

      {!task ? (
        <div className="p-4 text-sm text-muted-foreground">No task selected.</div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label htmlFor="detail-title">Title</Label>
            <Input
              id="detail-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && save("title", title.trim())}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="detail-desc">Description</Label>
            <Textarea
              id="detail-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (task.description ?? "") && save("description", description || null)}
              rows={4}
              placeholder="Add a description…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="detail-due">Due</Label>
              <Input
                id="detail-due"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                onBlur={() => {
                  if (!deadline) return;
                  const iso = new Date(deadline).toISOString();
                  if (iso !== task.deadline) save("deadline", iso);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v as "none" | string);
                  const next = v === "none" ? null : v;
                  if (next !== (task.projectId ?? null)) save("projectId", next);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => {
                  setPriority(v as TaskPriority);
                  if (v !== task.priority) save("priority", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v as TaskCategory);
                  if (v !== task.category) save("category", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <section className="space-y-2">
            <Label>Subtasks</Label>
            <ul className="space-y-1">
              {task.subtasks.map((s) => (
                <li key={s.id} className="group flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => updateSubtask(s.id, { done: !s.done }).catch(() => toast.error("Update failed"))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={s.done ? "Mark incomplete" : "Mark complete"}
                  >
                    {s.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>
                  <span className={s.done ? "flex-1 text-muted-foreground line-through" : "flex-1"}>
                    {s.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteSubtask(s.id).catch(() => toast.error("Delete failed"))}
                    className="text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                    aria-label="Delete subtask"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddSubtask())}
                placeholder="Add subtask…"
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleAddSubtask}>
                Add
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <Label>Attached files</Label>
            {!files || files.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files attached to this task.</p>
            ) : (
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={f.blobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {f.filename}
                    </a>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button variant="outline" size="sm" disabled>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Run AI breakdown
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Available in Wave 4.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </aside>
  );
}
