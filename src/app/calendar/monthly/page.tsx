"use client";

import { Suspense } from "react";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { MonthlyView } from "@/components/calendar/monthly-view";

export default function CalendarMonthlyPage() {
  return (
    <Suspense fallback={null}>
      <CalendarShell>
        {(ctx) => <MonthlyView ctx={ctx} />}
      </CalendarShell>
    </Suspense>
  );
}
