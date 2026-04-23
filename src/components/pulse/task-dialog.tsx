"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTask } from "@/client-lib/api-client";
import { useProjects } from "@/client-lib/projects-client";
import type { AppMode, TaskCategory, TaskPriority } from "@/shared/models/pulse";

interface Props {
  mode: AppMode;
  trigger?: React.ReactNode;
  /**
   * When set, the Project dropdown is pre-selected to this project id
   * (the user can still change it to another project or "No project").
   */
  defaultProjectId?: string | null;
}

const NO_PROJECT_VALUE = "__none__";

const CATEGORIES: TaskCategory[] = ["School", "Work", "Certification", "Personal"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Critical"];

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  // Format for datetime-local: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskDialog({ mode, trigger, defaultProjectId }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(mode === "work" ? "Work" : "School");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [subs, setSubs] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);

  const { data: projects } = useProjects();

  const reset = () => {
    setTitle("");
    setPriority("Medium");
    setDeadline(defaultDeadline());
    setHours("1");
    setMinutes("0");
    setNotes("");
    setSubs([]);
    setSubDraft("");
    setProjectId(defaultProjectId ?? null);
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    const total = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    if (total <= 0) {
      toast.error("Estimated time must be > 0");
      return;
    }
    setSubmitting(true);
    try {
      await createTask({
        title: title.trim(),
        category,
        deadline: new Date(deadline).toISOString(),
        estimatedMinutes: total,
        priority,
        mode,
        notes: notes.trim() || undefined,
        subtasks: subs,
        projectId,
      });
      toast.success("Task created");
      reset();
      setOpen(false);
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-1.5 h-4 w-4" />
            New Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Essay on Renaissance art" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select
              value={projectId ?? NO_PROJECT_VALUE}
              onValueChange={(v) => setProjectId(v === NO_PROJECT_VALUE ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Deadline</Label>
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Estimated time to complete</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} className="w-20" />
              <span className="text-sm text-muted-foreground">hours</span>
              <Input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-20" />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Subtasks (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && subDraft.trim()) {
                    e.preventDefault();
                    setSubs((s) => [...s, subDraft.trim()]);
                    setSubDraft("");
                  }
                }}
                placeholder="e.g. Research sources"
              />
              <Button type="button" variant="secondary" onClick={() => {
                if (subDraft.trim()) { setSubs((s) => [...s, subDraft.trim()]); setSubDraft(""); }
              }}>Add</Button>
            </div>
            {subs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {subs.map((s, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-sm">
                    <span>{s}</span>
                    <button type="button" onClick={() => setSubs((arr) => arr.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Creating…" : "Create Task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
