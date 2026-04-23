"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Flame, Target, Timer, Plus } from "lucide-react";
import { useTasks, usePrefs } from "@/client-lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskCard } from "@/components/pulse/task-card";
import { TaskDialog } from "@/components/pulse/task-dialog";
import { SmartImportDialog } from "@/components/pulse/smart-import-dialog";
import { ModeSwitch } from "@/components/pulse/mode-switch";
import { PulseNotifier } from "@/components/pulse/notifications";
import { computeUrgency, formatDuration } from "@/shared/models/pulse";

function formatWindow(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "0m";
  const d = Math.floor(total / (60 * 24));
  const h = Math.floor((total - d * 60 * 24) / 60);
  const m = total - d * 60 * 24 - h * 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export default function DashboardPage() {
  const { data: tasks, isLoading } = useTasks();
  const { data: prefs } = usePrefs();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  const mode = prefs?.mode ?? "student";

  const { sorted, criticalToday, totalNeeded, nextDeadlineWindow, stats } = useMemo(() => {
    const all = (tasks ?? []).filter((t) => t.mode === mode);
    const active = all.filter((t) => t.status !== "done");
    const withU = active.map((t) => ({ t, u: computeUrgency(t, now) }));
    // Sort by soonest deadline first (ties broken by higher urgency score)
    withU.sort((a, b) => {
      const da = new Date(a.t.deadline).getTime();
      const db = new Date(b.t.deadline).getTime();
      if (da !== db) return da - db;
      return b.u.score - a.u.score;
    });

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const critical = withU.filter(
      (x) => new Date(x.t.deadline).getTime() <= endOfDay.getTime() || x.u.level === "now" || x.u.level === "overdue",
    );

    const needed = active.reduce((acc, t) => acc + Math.max(0, t.estimatedMinutes - t.completedMinutes), 0);
    // True window to the earliest deadline (no 7-day cap) \u2014 overload math must reflect reality.
    const earliest = active.reduce<number | null>((min, t) => {
      const mins = Math.max(0, (new Date(t.deadline).getTime() - now.getTime()) / 60000);
      return min === null ? mins : Math.min(min, mins);
    }, null);

    return {
      sorted: withU,
      criticalToday: critical,
      totalNeeded: needed,
      nextDeadlineWindow: earliest ?? 0,
      stats: {
        total: active.length,
        done: all.filter((t) => t.status === "done").length,
        critical: withU.filter((x) => x.u.level === "now" || x.u.level === "overdue").length,
      },
    };
  }, [tasks, mode, now]);

  const overloaded = totalNeeded > nextDeadlineWindow && nextDeadlineWindow > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <PulseNotifier />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Flame className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Pulse</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Your personal time strategist</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeSwitch />
          <SmartImportDialog mode={mode} />
          <TaskDialog mode={mode} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Target className="h-4 w-4" />} label="Active tasks" value={stats.total.toString()} />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Need attention"
          value={stats.critical.toString()}
          accent={stats.critical > 0 ? "text-red-500" : undefined}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="Time needed"
          value={formatDuration(totalNeeded)}
          accent={overloaded ? "text-orange-500" : undefined}
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Next deadline"
          value={stats.total === 0 ? "\u2014" : formatWindow(nextDeadlineWindow)}
        />
      </div>

      {overloaded && (
        <Card className="border-orange-500/40 bg-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <div className="text-sm">
              <p className="font-medium">You&apos;re overloaded</p>
              <p className="text-muted-foreground">
                Your tasks need <b>{formatDuration(totalNeeded)}</b> of work, but only <b>{formatWindow(nextDeadlineWindow)}</b> remain before your
                next deadline. Consider rescheduling or dropping a low-priority task.
              </p>
            </div>
          </div>
        </Card>
      )}

      {criticalToday.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Critical today</h2>
          </div>
          <div className="space-y-3">
            {criticalToday.map(({ t }) => (
              <TaskCard key={t.id} task={t} now={now} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {criticalToday.length > 0 ? "Everything else" : "By deadline"}
        </h2>
        {isLoading && <div className="text-sm text-muted-foreground">Loading\u2026</div>}
        {!isLoading && sorted.filter((x) => !criticalToday.includes(x)).length === 0 && (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {sorted.length === 0
                ? `No ${mode === "student" ? "assignments" : "projects"} yet. Create your first task to get started.`
                : "All clear. Nice work \ud83d\ude4c"}
            </p>
            {sorted.length === 0 && (
              <TaskDialog
                mode={mode}
                trigger={
                  <Button>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create your first task
                  </Button>
                }
              />
            )}
          </Card>
        )}
        <div className="space-y-3">
          {sorted
            .filter((x) => !criticalToday.includes(x))
            .map(({ t }) => (
              <TaskCard key={t.id} task={t} now={now} />
            ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}
