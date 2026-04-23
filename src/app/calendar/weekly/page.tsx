"use client";

import { Suspense } from "react";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { WeeklyView } from "@/components/calendar/weekly-view";

export default function CalendarWeeklyPage() {
  return (
    <Suspense fallback={null}>
      <CalendarShell>
        {(ctx) => <WeeklyView ctx={ctx} />}
      </CalendarShell>
    </Suspense>
  );
}
