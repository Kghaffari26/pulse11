import {
  addDays,
  parseDateParam,
  startOfDay,
  toDateParam,
} from "./calendar-utils";

describe("addDays", () => {
  test("returns the next day in local timezone", () => {
    const start = new Date(2026, 3, 23); // Apr 23, 2026 local midnight
    const next = addDays(start, 1);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(3);
    expect(next.getDate()).toBe(24);
    // The original Date is not mutated.
    expect(start.getDate()).toBe(23);
  });

  test("returns the previous day with a negative delta", () => {
    const start = new Date(2026, 3, 23);
    const prev = addDays(start, -1);
    expect(prev.getDate()).toBe(22);
  });

  test("crosses a month boundary", () => {
    const end = new Date(2026, 3, 30);
    const next = addDays(end, 1);
    expect(next.getMonth()).toBe(4);
    expect(next.getDate()).toBe(1);
  });
});

describe("parseDateParam / toDateParam round-trip", () => {
  test("startOfDay(new Date()) round-trips through toDateParam + parseDateParam", () => {
    // This is the exact flow used by the Today button: setDate(new Date())
    // -> toDateParam writes the URL -> re-render parses the URL back.
    const today = startOfDay(new Date());
    const roundTripped = parseDateParam(toDateParam(today));
    expect(roundTripped.getFullYear()).toBe(today.getFullYear());
    expect(roundTripped.getMonth()).toBe(today.getMonth());
    expect(roundTripped.getDate()).toBe(today.getDate());
    expect(roundTripped.getHours()).toBe(0);
    expect(roundTripped.getMinutes()).toBe(0);
  });

  test("YYYY-MM-DD is interpreted as local midnight, not UTC midnight", () => {
    // Before the fix, `new Date("2026-04-23")` was parsed as UTC midnight,
    // which in any western tz showed up locally as Apr 22. Assert the local
    // components directly so the test is tz-independent.
    const d = parseDateParam("2026-04-23");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(0);
  });

  test("prev/next over several days is stable through the URL round-trip", () => {
    // Simulates: user is on Apr 23, clicks Next, URL updates, component
    // re-parses, clicks Next again. Label/date must advance exactly one
    // day per click.
    let date = parseDateParam("2026-04-23");
    expect(date.getDate()).toBe(23);

    date = parseDateParam(toDateParam(addDays(date, 1)));
    expect(date.getDate()).toBe(24);

    date = parseDateParam(toDateParam(addDays(date, 1)));
    expect(date.getDate()).toBe(25);

    date = parseDateParam(toDateParam(addDays(date, -1)));
    expect(date.getDate()).toBe(24);
  });

  test("parseDateParam falls back to today on invalid or empty input", () => {
    const todayLocal = startOfDay(new Date());
    for (const bad of [null, undefined, "", "not-a-date"]) {
      const d = parseDateParam(bad);
      expect(d.getFullYear()).toBe(todayLocal.getFullYear());
      expect(d.getMonth()).toBe(todayLocal.getMonth());
      expect(d.getDate()).toBe(todayLocal.getDate());
    }
  });
});
