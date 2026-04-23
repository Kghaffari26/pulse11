import {
  validateCategoryInput,
  validateCategoryPatch,
  validateEventInput,
  validateEventPatch,
  EVENT_TITLE_MAX,
  CATEGORY_NAME_MAX,
} from "./calendar";

describe("validateEventInput", () => {
  const base = {
    title: "Study session",
    startTime: "2026-05-01T14:00:00.000Z",
    endTime: "2026-05-01T15:00:00.000Z",
  };

  test("accepts a fully-valid payload", () => {
    const r = validateEventInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Study session");
      expect(r.value.allDay).toBe(false);
      expect(r.value.categoryId).toBeNull();
    }
  });

  test("rejects empty or whitespace title", () => {
    expect(validateEventInput({ ...base, title: "" }).ok).toBe(false);
    expect(validateEventInput({ ...base, title: "   " }).ok).toBe(false);
  });

  test("rejects title over max length", () => {
    const over = "a".repeat(EVENT_TITLE_MAX + 1);
    expect(validateEventInput({ ...base, title: over }).ok).toBe(false);
  });

  test("rejects unparseable start/end", () => {
    expect(validateEventInput({ ...base, startTime: "not-a-date" }).ok).toBe(false);
    expect(validateEventInput({ ...base, endTime: "x" }).ok).toBe(false);
  });

  test("rejects endTime before startTime", () => {
    const r = validateEventInput({
      ...base,
      startTime: "2026-05-01T15:00:00.000Z",
      endTime: "2026-05-01T14:00:00.000Z",
    });
    expect(r.ok).toBe(false);
  });

  test("accepts end == start (zero-length event)", () => {
    const r = validateEventInput({
      ...base,
      startTime: "2026-05-01T14:00:00.000Z",
      endTime: "2026-05-01T14:00:00.000Z",
    });
    expect(r.ok).toBe(true);
  });

  test("rejects non-UUID categoryId", () => {
    const r = validateEventInput({ ...base, categoryId: "not-a-uuid" });
    expect(r.ok).toBe(false);
  });

  test("accepts null categoryId", () => {
    const r = validateEventInput({ ...base, categoryId: null });
    expect(r.ok).toBe(true);
  });

  test("coerces allDay=true through", () => {
    const r = validateEventInput({ ...base, allDay: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.allDay).toBe(true);
  });

  test("rejects non-boolean allDay", () => {
    const r = validateEventInput({ ...base, allDay: "yes" });
    expect(r.ok).toBe(false);
  });
});

describe("validateEventPatch", () => {
  test("accepts empty patch", () => {
    const r = validateEventPatch({});
    expect(r.ok).toBe(true);
  });

  test("rejects empty title on patch", () => {
    expect(validateEventPatch({ title: "" }).ok).toBe(false);
  });

  test("rejects end < start when both are patched together", () => {
    const r = validateEventPatch({
      startTime: "2026-05-01T12:00:00.000Z",
      endTime: "2026-05-01T11:00:00.000Z",
    });
    expect(r.ok).toBe(false);
  });

  test("allows patching just one time boundary", () => {
    // The route does its own cross-field check against the stored row.
    const r = validateEventPatch({ startTime: "2026-05-01T09:00:00.000Z" });
    expect(r.ok).toBe(true);
  });

  test("coerces empty description to null", () => {
    const r = validateEventPatch({ description: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.description).toBeNull();
  });
});

describe("validateCategoryInput", () => {
  test("accepts name + hex color", () => {
    const r = validateCategoryInput({ name: "Work", color: "#3B82F6" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.color).toBe("#3B82F6");
  });

  test("rejects missing name", () => {
    expect(validateCategoryInput({ color: "#3B82F6" }).ok).toBe(false);
  });

  test("rejects non-hex color", () => {
    expect(validateCategoryInput({ name: "x", color: "blue" }).ok).toBe(false);
    expect(validateCategoryInput({ name: "x", color: "#abc" }).ok).toBe(false);
    expect(validateCategoryInput({ name: "x", color: "#ZZZZZZ" }).ok).toBe(false);
  });

  test("rejects name over max", () => {
    const over = "a".repeat(CATEGORY_NAME_MAX + 1);
    expect(validateCategoryInput({ name: over, color: "#000000" }).ok).toBe(false);
  });

  test("trims whitespace from name", () => {
    const r = validateCategoryInput({ name: "  trimmed  ", color: "#000000" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("trimmed");
  });
});

describe("validateCategoryPatch", () => {
  test("accepts partial updates", () => {
    const r = validateCategoryPatch({ color: "#FF0000" });
    expect(r.ok).toBe(true);
  });

  test("rejects invalid partial color", () => {
    expect(validateCategoryPatch({ color: "red" }).ok).toBe(false);
  });

  test("rejects empty name", () => {
    expect(validateCategoryPatch({ name: "" }).ok).toBe(false);
    expect(validateCategoryPatch({ name: "   " }).ok).toBe(false);
  });
});
