"use client";

import { useEffect, useMemo, useState } from "react";
import { useTasks, usePrefs } from "@/client-lib/api-client";
import { TaskCard } from "@/components/pulse/task-card";
import { TaskDetailPanel } from "@/components/pulse/task-detail-panel";
import { TaskDialog } from "@/components/pulse/task-dialog";
import { SmartImportDialog } from "@/components/pulse/smart-import-dialog";
import { ModeSwitch } from "@/components/pulse/mode-switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeUrgency, isTaskCompleted, type TaskCategory } from "@/shared/models/pulse";

const CATEGORIES: (TaskCategory | "all")[] = ["all", "School", "Work", "Certification", "Personal"];
const SORT_OPTIONS = ["urgency", "deadline", "created"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];
type CategoryFilter = TaskCategory | "all";

const FILTERS_STORAGE_KEY = "pulse:tasks-filters";

interface StoredFilters {
  category: CategoryFilter;
  sortBy: SortOption;
  search: string;
}

function loadStoredFilters(): StoredFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFilters>;
    const category: CategoryFilter = CATEGORIES.includes(parsed.category as CategoryFilter)
      ? (parsed.category as CategoryFilter)
      : "all";
    const sortBy: SortOption = SORT_OPTIONS.includes(parsed.sortBy as SortOption)
      ? (parsed.sortBy as SortOption)
      : "urgency";
    const search = typeof parsed.search === "string" ? parsed.search : "";
    return { category, sortBy, search };
  } catch {
    return null;
  }
}

export default function TasksPage() {
  const { data: tasks } = useTasks();
  const { data: prefs } = usePrefs();
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortOption>("urgency");
  const [hydrated, setHydrated] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  // Rehydrate filters from localStorage once on mount.
  useEffect(() => {
    const stored = loadStoredFilters();
    if (stored) {
      setCategory(stored.category);
      setSort(stored.sortBy);
      setQuery(stored.search);
    }
    setHydrated(true);
  }, []);

  // Persist filters whenever they change (after hydration, to avoid overwriting with defaults).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: StoredFilters = { category, sortBy: sort, search: query };
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore (quota / disabled storage)
    }
  }, [category, sort, query, hydrated]);

  const mode = prefs?.mode ?? "student";

  const filtered = useMemo(() => {
    const list = (tasks ?? []).filter((t) => t.mode === mode);
    const filtered = list.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "urgency") return computeUrgency(b, now).score - computeUrgency(a, now).score;
      if (sort === "deadline") return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }, [tasks, mode, category, query, sort, now]);

  const active = filtered.filter((t) => !isTaskCompleted(t));
  const done = filtered.filter((t) => isTaskCompleted(t));

  const selectedTask = useMemo(
    () => (tasks ?? []).find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and manage all your tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeSwitch />
          <SmartImportDialog mode={mode} />
          <TaskDialog mode={mode} />
        </div>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs" />
        <Select value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="urgency">Sort: Urgency</SelectItem>
            <SelectItem value="deadline">Sort: Deadline</SelectItem>
            <SelectItem value="created">Sort: Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="done">Completed ({done.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4 space-y-3">
          {active.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No tasks match your filters.</Card>}
          {active.map((t) => <TaskCard key={t.id} task={t} now={now} onOpenDetail={setSelectedTaskId} />)}
        </TabsContent>
        <TabsContent value="done" className="mt-4 space-y-3">
          {done.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No completed tasks yet.</Card>}
          {done.map((t) => <TaskCard key={t.id} task={t} now={now} onOpenDetail={setSelectedTaskId} />)}
        </TabsContent>
      </Tabs>

      <TaskDetailPanel
        task={selectedTask}
        open={selectedTaskId != null}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
