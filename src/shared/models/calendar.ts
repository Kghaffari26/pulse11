export interface EventCategory {
  id: string;
  userEmail: string;
  name: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  userEmail: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  categoryId?: string | null;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  allDay?: boolean;
}

export interface EventPatch {
  categoryId?: string | null;
  title?: string;
  description?: string | null;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
}

export interface CategoryInput {
  name: string;
  color: string;
}

export interface CategoryPatch {
  name?: string;
  color?: string;
}

export const EVENT_TITLE_MAX = 200;
export const EVENT_DESCRIPTION_MAX = 2000;
export const CATEGORY_NAME_MAX = 50;

export type Validation<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: string; value?: undefined };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function isValidIsoDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

export function validateEventInput(input: unknown): Validation<Required<Pick<EventInput, "title" | "startTime" | "endTime">> & EventInput> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const obj = input as Record<string, unknown>;

  if (!isNonEmptyString(obj.title)) return { ok: false, error: "title is required" };
  if ((obj.title as string).trim().length > EVENT_TITLE_MAX) {
    return { ok: false, error: `title must be <= ${EVENT_TITLE_MAX} characters` };
  }
  if (!isValidIsoDate(obj.startTime)) return { ok: false, error: "startTime must be a valid ISO date" };
  if (!isValidIsoDate(obj.endTime)) return { ok: false, error: "endTime must be a valid ISO date" };

  const start = new Date(obj.startTime as string).getTime();
  const end = new Date(obj.endTime as string).getTime();
  if (end < start) return { ok: false, error: "endTime must be >= startTime" };

  if ("categoryId" in obj && obj.categoryId != null && !isValidUuid(obj.categoryId)) {
    return { ok: false, error: "categoryId must be a UUID or null" };
  }
  if ("description" in obj && obj.description != null) {
    if (typeof obj.description !== "string") return { ok: false, error: "description must be string or null" };
    if ((obj.description as string).length > EVENT_DESCRIPTION_MAX) {
      return { ok: false, error: `description must be <= ${EVENT_DESCRIPTION_MAX} characters` };
    }
  }
  if ("allDay" in obj && typeof obj.allDay !== "boolean") {
    return { ok: false, error: "allDay must be a boolean" };
  }

  return {
    ok: true,
    value: {
      title: (obj.title as string).trim(),
      startTime: obj.startTime as string,
      endTime: obj.endTime as string,
      categoryId: (obj.categoryId as string | null | undefined) ?? null,
      description:
        typeof obj.description === "string" && obj.description.trim()
          ? (obj.description as string)
          : null,
      allDay: obj.allDay === true,
    },
  };
}

export function validateEventPatch(input: unknown): Validation<EventPatch> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const obj = input as Record<string, unknown>;
  const out: EventPatch = {};

  if ("title" in obj) {
    if (!isNonEmptyString(obj.title)) return { ok: false, error: "title must be non-empty" };
    if ((obj.title as string).trim().length > EVENT_TITLE_MAX) {
      return { ok: false, error: `title must be <= ${EVENT_TITLE_MAX} characters` };
    }
    out.title = (obj.title as string).trim();
  }
  if ("startTime" in obj) {
    if (!isValidIsoDate(obj.startTime)) return { ok: false, error: "startTime must be a valid ISO date" };
    out.startTime = obj.startTime as string;
  }
  if ("endTime" in obj) {
    if (!isValidIsoDate(obj.endTime)) return { ok: false, error: "endTime must be a valid ISO date" };
    out.endTime = obj.endTime as string;
  }
  if (out.startTime && out.endTime) {
    if (new Date(out.endTime).getTime() < new Date(out.startTime).getTime()) {
      return { ok: false, error: "endTime must be >= startTime" };
    }
  }
  if ("categoryId" in obj) {
    if (obj.categoryId != null && !isValidUuid(obj.categoryId)) {
      return { ok: false, error: "categoryId must be a UUID or null" };
    }
    out.categoryId = (obj.categoryId as string | null | undefined) ?? null;
  }
  if ("description" in obj) {
    if (obj.description != null) {
      if (typeof obj.description !== "string") return { ok: false, error: "description must be string or null" };
      if ((obj.description as string).length > EVENT_DESCRIPTION_MAX) {
        return { ok: false, error: `description must be <= ${EVENT_DESCRIPTION_MAX} characters` };
      }
      out.description = (obj.description as string).trim() || null;
    } else {
      out.description = null;
    }
  }
  if ("allDay" in obj) {
    if (typeof obj.allDay !== "boolean") return { ok: false, error: "allDay must be a boolean" };
    out.allDay = obj.allDay;
  }

  return { ok: true, value: out };
}

export function validateCategoryInput(input: unknown): Validation<CategoryInput> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const obj = input as Record<string, unknown>;

  if (!isNonEmptyString(obj.name)) return { ok: false, error: "name is required" };
  if ((obj.name as string).trim().length > CATEGORY_NAME_MAX) {
    return { ok: false, error: `name must be <= ${CATEGORY_NAME_MAX} characters` };
  }
  if (!isValidHexColor(obj.color)) return { ok: false, error: "color must be a 6-digit hex (e.g. #3B82F6)" };

  return {
    ok: true,
    value: { name: (obj.name as string).trim(), color: obj.color as string },
  };
}

export function validateCategoryPatch(input: unknown): Validation<CategoryPatch> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const obj = input as Record<string, unknown>;
  const out: CategoryPatch = {};

  if ("name" in obj) {
    if (!isNonEmptyString(obj.name)) return { ok: false, error: "name must be non-empty" };
    if ((obj.name as string).trim().length > CATEGORY_NAME_MAX) {
      return { ok: false, error: `name must be <= ${CATEGORY_NAME_MAX} characters` };
    }
    out.name = (obj.name as string).trim();
  }
  if ("color" in obj) {
    if (!isValidHexColor(obj.color)) return { ok: false, error: "color must be a 6-digit hex" };
    out.color = obj.color as string;
  }

  return { ok: true, value: out };
}

export const DEFAULT_CATEGORIES: readonly CategoryInput[] = [
  { name: "Academic", color: "#3B82F6" },
  { name: "Personal", color: "#A855F7" },
  { name: "Deadline", color: "#EF4444" },
  { name: "Other", color: "#6B7280" },
];

export const COLOR_PRESETS: readonly string[] = [
  "#3B82F6",
  "#A855F7",
  "#EF4444",
  "#6B7280",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
];
