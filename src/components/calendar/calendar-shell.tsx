"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings as SettingsIcon,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryManager } from "./category-manager";
import { EventModal, type EventModalDefaults } from "./event-modal";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfWeek,
  isCalendarView,
  monthGridEnd,
  monthGridStart,
  parseDateParam,
  startOfDay,
  startOfWeek,
  toDateParam,
  type CalendarView,
} from "./calendar-utils";
import type { CalendarEvent } from "@/shared/models/calendar";
import { useEvents } from "@/client-lib/calendar-client";
import { cn } from "@/shared/utils";

interface Props {
  children: (ctx: CalendarChildCtx) => React.ReactNode;
}

export interface CalendarChildCtx {
  view: CalendarView;
  date: Date;
  events: CalendarEvent[];
  eventsLoading: boolean;
  openCreate: (defaults?: EventModalDefaults) => void;
  openEdit: (event: CalendarEvent) => void;
  goToDate: (d: Date) => void;
}

function rangeFor(view: CalendarView, date: Date): { from: Date; to: Date } {
  if (view === "daily") return { from: startOfDay(date), to: endOfDay(date) };
  if (view === "weekly") return { from: startOfWeek(date), to: endOfWeek(date) };
  return { from: monthGridStart(date), to: monthGridEnd(date) };
}

function headerLabelFor(view: CalendarView, date: Date): string {
  if (view === "daily") {
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "weekly") {
    const s = startOfWeek(date);
    const e = endOfWeek(date);
    const sameMonth = s.getMonth() === e.getMonth();
    if (sameMonth) {
      return `${s.toLocaleString([], { month: "long" })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${s.toLocaleString([], { month: "short", day: "numeric" })} – ${e.toLocaleString([], { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return date.toLocaleString([], { month: "long", year: "numeric" });
}

export function CalendarShell({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewFromPath: CalendarView = (() => {
    const last = pathname.split("/").pop() ?? "";
    return isCalendarView(last) ? last : "weekly";
  })();

  const date = parseDateParam(searchParams.get("date"));

  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [createDefaults, setCreateDefaults] = useState<EventModalDefaults | undefined>(undefined);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const { from, to } = rangeFor(viewFromPath, date);
  const { data: events, isLoading: eventsLoading } = useEvents(from.toISOString(), to.toISOString());

  const setDate = (d: Date) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("date", toDateParam(d));
    router.replace(`${pathname}?${params.toString()}`);
  };

  const setView = (v: CalendarView) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("date", toDateParam(date));
    router.push(`/calendar/${v}?${params.toString()}`);
  };

  const prev = () => {
    if (viewFromPath === "daily") setDate(addDays(date, -1));
    else if (viewFromPath === "weekly") setDate(addDays(date, -7));
    else setDate(addMonths(date, -1));
  };
  const next = () => {
    if (viewFromPath === "daily") setDate(addDays(date, 1));
    else if (viewFromPath === "weekly") setDate(addDays(date, 7));
    else setDate(addMonths(date, 1));
  };
  const today = () => setDate(new Date());

  const openCreate = (defaults?: EventModalDefaults) => {
    setEditEvent(null);
    setCreateDefaults(defaults);
    setModalOpen(true);
  };
  const openEdit = (event: CalendarEvent) => {
    setEditEvent(event);
    setCreateDefaults(undefined);
    setModalOpen(true);
  };

  const ctx: CalendarChildCtx = useMemo(
    () => ({
      view: viewFromPath,
      date,
      events: events ?? [],
      eventsLoading,
      openCreate,
      openEdit,
      goToDate: setDate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewFromPath, date.getTime(), events, eventsLoading],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <ViewButton current={viewFromPath} value="daily" label="Daily" icon={<CalendarIcon className="h-3.5 w-3.5" />} onClick={() => setView("daily")} />
            <ViewButton current={viewFromPath} value="weekly" label="Weekly" icon={<CalendarRange className="h-3.5 w-3.5" />} onClick={() => setView("weekly")} />
            <ViewButton current={viewFromPath} value="monthly" label="Monthly" icon={<CalendarDays className="h-3.5 w-3.5" />} onClick={() => setView("monthly")} />
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={prev} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={today}>Today</Button>
            <Button variant="ghost" size="icon" onClick={next} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="ml-2 text-sm font-medium">{headerLabelFor(viewFromPath, date)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoryOpen(true)}>
            <SettingsIcon className="mr-1.5 h-3.5 w-3.5" />
            Manage categories
          </Button>
          <Button onClick={() => openCreate()}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Event
          </Button>
        </div>
      </header>

      {children(ctx)}

      <EventModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        event={editEvent}
        defaults={createDefaults}
      />
      <CategoryManager open={categoryOpen} onOpenChange={setCategoryOpen} />
    </div>
  );
}

function ViewButton({
  current,
  value,
  label,
  icon,
  onClick,
}: {
  current: CalendarView;
  value: CalendarView;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
