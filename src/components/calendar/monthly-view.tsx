"use client";

import { useMemo, useState } from "react";
import { useEventCategories } from "@/client-lib/calendar-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarEvent } from "@/shared/models/calendar";
import { cn } from "@/shared/utils";
import type { CalendarChildCtx } from "./calendar-shell";
import {
  addDays,
  endOfDay,
  monthGridStart,
  sameDay,
  startOfDay,
  toDateParam,
} from "./calendar-utils";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_COLOR = "#6B7280";
const MAX_PILLS = 3;

export function MonthlyView({ ctx }: { ctx: CalendarChildCtx }) {
  const { data: categories } = useEventCategories();
  const categoryColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories ?? []) map.set(c.id, c.color);
    return map;
  }, [categories]);

  const gridStart = monthGridStart(ctx.date);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of ctx.events) {
      const s = new Date(e.startTime).getTime();
      const ed = new Date(e.endTime).getTime();
      for (const d of days) {
        const ds = startOfDay(d).getTime();
        const de = endOfDay(d).getTime();
        if (ed > ds && s < de) {
          const key = toDateParam(d);
          const arr = map.get(key) ?? [];
          arr.push(e);
          map.set(key, arr);
        }
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [ctx.events, days]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/30 text-xs">
        {WEEKDAY_NAMES.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center font-medium text-muted-foreground">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {days.map((d) => {
          const inMonth = d.getMonth() === ctx.date.getMonth();
          const isToday = sameDay(d, today);
          const key = toDateParam(d);
          const evs = eventsByDay.get(key) ?? [];
          const visible = evs.slice(0, MAX_PILLS);
          const overflow = evs.length - visible.length;
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "flex min-h-[120px] flex-col gap-1 bg-card p-1.5 transition-colors",
                !inMonth && "bg-muted/30 text-muted-foreground/60",
                isToday && "ring-2 ring-primary ring-inset",
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => ctx.goToDate(d)}
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs hover:bg-accent",
                    isToday && "bg-primary text-primary-foreground font-semibold",
                  )}
                  aria-label={`Go to ${d.toLocaleDateString()}`}
                >
                  {d.getDate()}
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((e) => {
                  const color = (e.categoryId && categoryColor.get(e.categoryId)) || DEFAULT_COLOR;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => ctx.openEdit(e)}
                      className="truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-white shadow-sm"
                      style={{ backgroundColor: color }}
                      title={e.title}
                    >
                      {e.title}
                    </button>
                  );
                })}
                {overflow > 0 && <MorePopover date={d} events={evs} ctx={ctx} categoryColor={categoryColor} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MorePopover({
  date,
  events,
  ctx,
  categoryColor,
}: {
  date: Date;
  events: CalendarEvent[];
  ctx: CalendarChildCtx;
  categoryColor: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left text-[10px] font-semibold text-muted-foreground hover:text-foreground"
        >
          +{events.length - MAX_PILLS} more
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="mb-1.5 px-1 text-xs font-semibold">
          {date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
        </div>
        <ul className="space-y-1">
          {events.map((e) => {
            const color = (e.categoryId && categoryColor.get(e.categoryId)) || DEFAULT_COLOR;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    ctx.openEdit(e);
                  }}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 truncate font-medium">{e.title}</span>
                  {!e.allDay && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(e.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
