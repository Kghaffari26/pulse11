"use client";

import { Suspense } from "react";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { DailyView } from "@/components/calendar/daily-view";

export default function CalendarDailyPage() {
  return (
    <Suspense fallback={null}>
      <CalendarShell>
        {(ctx) => <DailyView ctx={ctx} />}
      </CalendarShell>
    </Suspense>
  );
}
