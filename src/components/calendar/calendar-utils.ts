export type CalendarView = "daily" | "weekly" | "monthly";

export function isCalendarView(v: string | null): v is CalendarView {
  return v === "daily" || v === "weekly" || v === "monthly";
}

/** Parse a YYYY-MM-DD-ish ISO into a local-timezone Date, or today on failure. */
export function parseDateParam(raw: string | null | undefined): Date {
  if (!raw) return startOfDay(new Date());
  // `new Date("2026-04-23")` is parsed as UTC midnight per the ECMAScript
  // spec, which in any western timezone rolls back to the previous local
  // day. Handle the YYYY-MM-DD form explicitly as local-tz midnight so the
  // round-trip through toDateParam/parseDateParam is stable.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return startOfDay(new Date());
  return d;
}

export function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = out.getDay(); // 0 = Sunday
  out.setDate(out.getDate() - day);
  return out;
}

export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return endOfDay(e);
}

export function startOfMonth(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfDay(out);
}

export function endOfMonth(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return endOfDay(out);
}

/** Grid covering a month view: full weeks from the Sunday before the 1st, 6 rows of 7. */
export function monthGridStart(d: Date): Date {
  const s = startOfMonth(d);
  const offset = s.getDay();
  const g = new Date(s);
  g.setDate(s.getDate() - offset);
  return startOfDay(g);
}

export function monthGridEnd(d: Date): Date {
  const start = monthGridStart(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 42 - 1);
  return endOfDay(end);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function formatTimeShort(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Build `YYYY-MM-DDTHH:mm` for <input type="datetime-local"> in local tz. */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a `YYYY-MM-DDTHH:mm` local datetime-local value into an ISO UTC string. */
export function datetimeLocalToIso(v: string): string {
  return new Date(v).toISOString();
}

/** Given a local Date, build a UTC ISO for 00:00:00 that day in local tz. */
export function localDayStartIso(d: Date): string {
  return startOfDay(d).toISOString();
}

/** Given a local Date, build a UTC ISO for 23:59:59.999 that day in local tz. */
export function localDayEndIso(d: Date): string {
  return endOfDay(d).toISOString();
}
