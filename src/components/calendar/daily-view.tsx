"use client";

import { useMemo } from "react";
import { useEventCategories } from "@/client-lib/calendar-client";
import type { CalendarEvent } from "@/shared/models/calendar";
import type { CalendarChildCtx } from "./calendar-shell";
import { endOfDay, formatHourLabel, startOfDay } from "./calendar-utils";

const HOUR_HEIGHT_PX = 52;
const DEFAULT_COLOR = "#6B7280";

interface LayoutItem {
  event: CalendarEvent;
  columnIndex: number;
  columnCount: number;
}

/**
 * Group overlapping events into clusters, then assign each event to the
 * lowest-indexed column where it doesn't collide with an earlier event in
 * the cluster. Column count is per-cluster so non-overlapping events don't
 * get artificially narrowed.
 */
function layoutEvents(events: CalendarEvent[]): LayoutItem[] {
  const sorted = [...events].sort((a, b) => {
    const s = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (s !== 0) return s;
    return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
  });

  const result: LayoutItem[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = 0;
  let columns: number[] = []; // column index -> latest end ms

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
    if (cluster.length === 0 || start >= clusterEnd) {
      // Start a fresh cluster.
      if (cluster.length > 0) flush();
    }
    // Find a column whose last-end is <= this start.
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

export function DailyView({ ctx }: { ctx: CalendarChildCtx }) {
  const { data: categories } = useEventCategories();
  const categoryColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories ?? []) map.set(c.id, c.color);
    return map;
  }, [categories]);

  const dayStart = startOfDay(ctx.date).getTime();
  const dayEnd = endOfDay(ctx.date).getTime();

  // Separate all-day events from timed.
  const allDay: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];
  for (const e of ctx.events) {
    if (e.allDay) allDay.push(e);
    else timed.push(e);
  }

  const layout = useMemo(() => layoutEvents(timed), [timed]);

  return (
    <div className="rounded-lg border bg-card">
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b bg-muted/30 p-2">
          <span className="text-xs font-medium text-muted-foreground">All day:</span>
          {allDay.map((e) => {
            const color = (e.categoryId && categoryColor.get(e.categoryId)) || DEFAULT_COLOR;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => ctx.openEdit(e)}
                className="truncate rounded px-2 py-0.5 text-xs font-medium text-white shadow-sm"
                style={{ backgroundColor: color }}
                title={e.title}
              >
                {e.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "64px 1fr" }}>
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

        {/* Event canvas */}
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT_PX }}>
          {/* Hour grid lines + click targets */}
          {Array.from({ length: 24 }, (_, h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                const start = new Date(ctx.date);
                start.setHours(h, 0, 0, 0);
                const end = new Date(start);
                end.setHours(end.getHours() + 1);
                ctx.openCreate({
                  startTime: start.toISOString(),
                  endTime: end.toISOString(),
                });
              }}
              className="absolute inset-x-0 border-t border-border hover:bg-accent/40"
              style={{ top: h * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
              aria-label={`Create event at ${formatHourLabel(h)}`}
            />
          ))}

          {/* Events */}
          {layout.map(({ event, columnIndex, columnCount }) => {
            const color = (event.categoryId && categoryColor.get(event.categoryId)) || DEFAULT_COLOR;
            const s = Math.max(new Date(event.startTime).getTime(), dayStart);
            const e = Math.min(new Date(event.endTime).getTime(), dayEnd);
            const startMin = (s - dayStart) / 60000;
            const endMin = (e - dayStart) / 60000;
            const top = (startMin / 60) * HOUR_HEIGHT_PX;
            const height = Math.max(18, ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2);
            const widthPct = 100 / columnCount;
            return (
              <button
                key={event.id}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  ctx.openEdit(event);
                }}
                className="absolute overflow-hidden rounded border border-white/30 px-1.5 py-0.5 text-left text-xs font-medium text-white shadow-sm hover:brightness-110"
                style={{
                  top,
                  height,
                  left: `calc(${columnIndex * widthPct}% + 4px)`,
                  width: `calc(${widthPct}% - 8px)`,
                  backgroundColor: color,
                }}
                title={event.title}
              >
                <div className="truncate">{event.title}</div>
                <div className="truncate text-[10px] opacity-90">
                  {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
