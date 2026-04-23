"use client";

import { useMemo } from "react";
import { useEventCategories } from "@/client-lib/calendar-client";
import type { CalendarEvent } from "@/shared/models/calendar";
import { cn } from "@/shared/utils";
import type { CalendarChildCtx } from "./calendar-shell";
import {
  addDays,
  endOfDay,
  formatHourLabel,
  sameDay,
  startOfDay,
  startOfWeek,
} from "./calendar-utils";

const HOUR_HEIGHT_PX = 48;
const DEFAULT_COLOR = "#6B7280";
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface LayoutItem {
  event: CalendarEvent;
  columnIndex: number;
  columnCount: number;
}

function layoutDay(events: CalendarEvent[]): LayoutItem[] {
  const sorted = [...events].sort((a, b) => {
    const s = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (s !== 0) return s;
    return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
  });
  const result: LayoutItem[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = 0;
  let columns: number[] = [];

  const flush = () => {
    const count = columns.length || 1;
    for (const ev of cluster) {
      const item = result.find((r) => r.event.id === ev.id);
      if (item) item.columnCount = count;
    }
    cluster = [];
    columns = [];
    clusterEnd = 0;
  };

  for (const ev of sorted) {
    const start = new Date(ev.startTime).getTime();
    const end = new Date(ev.endTime).getTime();
    if (cluster.length > 0 && start >= clusterEnd) flush();
    let col = columns.findIndex((c) => c <= start);
    if (col === -1) {
      col = columns.length;
      columns.push(end);
    } else {
      columns[col] = end;
    }
    cluster.push(ev);
    if (end > clusterEnd) clusterEnd = end;
    result.push({ event: ev, columnIndex: col, columnCount: columns.length });
  }
  if (cluster.length > 0) flush();
  return result;
}

export function WeeklyView({ ctx }: { ctx: CalendarChildCtx }) {
  const { data: categories } = useEventCategories();
  const categoryColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories ?? []) map.set(c.id, c.color);
    return map;
  }, [categories]);

  const weekStart = startOfWeek(ctx.date);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();

  // Split events per day (timed), collect all-day.
  const { eventsByDay, allDayByDay } = useMemo(() => {
    const timed: CalendarEvent[][] = Array.from({ length: 7 }, () => []);
    const allDay: CalendarEvent[][] = Array.from({ length: 7 }, () => []);
    for (const e of ctx.events) {
      for (let i = 0; i < 7; i++) {
        const dayStart = startOfDay(days[i]).getTime();
        const dayEnd = endOfDay(days[i]).getTime();
        const s = new Date(e.startTime).getTime();
        const ed = new Date(e.endTime).getTime();
        if (ed > dayStart && s < dayEnd) {
          if (e.allDay) allDay[i].push(e);
          else timed[i].push(e);
        }
      }
    }
    return { eventsByDay: timed, allDayByDay: allDay };
  }, [ctx.events, days]);

  const layoutsByDay = useMemo(() => eventsByDay.map((evs) => layoutDay(evs)), [eventsByDay]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Day header */}
      <div className="grid border-b" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
        <div />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => ctx.goToDate(d)}
              className={cn(
                "flex flex-col items-center justify-center border-l py-2 text-xs",
                isToday ? "bg-primary/10 font-semibold text-primary" : "hover:bg-accent/40",
              )}
            >
              <span>{WEEKDAY_NAMES[d.getDay()]}</span>
              <span className={cn("text-lg", isToday && "rounded-full bg-primary px-2 text-primary-foreground")}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* All-day row */}
      {allDayByDay.some((arr) => arr.length > 0) && (
        <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
          <div className="px-2 py-1.5 text-right text-[10px] font-medium text-muted-foreground">All day</div>
          {allDayByDay.map((arr, i) => (
            <div key={i} className={cn("flex flex-col gap-0.5 border-l p-1", sameDay(days[i], today) && "bg-primary/5")}>
              {arr.map((e) => {
                const color = (e.categoryId && categoryColor.get(e.categoryId)) || DEFAULT_COLOR;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => ctx.openEdit(e)}
                    className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                    style={{ backgroundColor: color }}
                    title={e.title}
                  >
                    {e.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
        {/* Hour gutter */}
        <div>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="relative border-r border-t text-[10px] text-muted-foreground"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              <span className="absolute -top-2 right-1.5 bg-card px-1">{formatHourLabel(h)}</span>
            </div>
          ))}
        </div>

        {/* 7 day columns */}
        {days.map((d, di) => {
          const isToday = sameDay(d, today);
          const dayStart = startOfDay(d).getTime();
          const dayEnd = endOfDay(d).getTime();
          return (
            <div
              key={d.toISOString()}
              className={cn("relative border-l", isToday && "bg-primary/5")}
              style={{ height: 24 * HOUR_HEIGHT_PX }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    const start = new Date(d);
                    start.setHours(h, 0, 0, 0);
                    const end = new Date(start);
                    end.setHours(end.getHours() + 1);
                    ctx.openCreate({ startTime: start.toISOString(), endTime: end.toISOString() });
                  }}
                  className="absolute inset-x-0 border-t border-border hover:bg-accent/30"
                  style={{ top: h * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
                  aria-label={`Create event at ${formatHourLabel(h)}`}
                />
              ))}
              {layoutsByDay[di].map(({ event, columnIndex, columnCount }) => {
                const color = (event.categoryId && categoryColor.get(event.categoryId)) || DEFAULT_COLOR;
                const s = Math.max(new Date(event.startTime).getTime(), dayStart);
                const e = Math.min(new Date(event.endTime).getTime(), dayEnd);
                const startMin = (s - dayStart) / 60000;
                const endMin = (e - dayStart) / 60000;
                const top = (startMin / 60) * HOUR_HEIGHT_PX;
                const height = Math.max(14, ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2);
                const widthPct = 100 / columnCount;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      ctx.openEdit(event);
                    }}
                    className="absolute overflow-hidden rounded border border-white/30 px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-white shadow-sm hover:brightness-110"
                    style={{
                      top,
                      height,
                      left: `calc(${columnIndex * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: color,
                    }}
                    title={event.title}
                  >
                    <div className="truncate">{event.title}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
