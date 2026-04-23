import type { TaskCategory, TaskPriority, TaskStatus } from "./pulse";

export const TASK_CATEGORIES: readonly TaskCategory[] = ["School", "Work", "Certification", "Personal"];
export const TASK_PRIORITIES: readonly TaskPriority[] = ["Low", "Medium", "High", "Critical"];
export const TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "done", "completed"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

function isValidDate(v: unknown): boolean {
  if (typeof v !== "string" && !(v instanceof Date)) return false;
  const d = typeof v === "string" ? new Date(v) : v;
  return !isNaN(d.getTime());
}

/**
 * Validate a full new-task input (used by POST /api/tasks).
 */
export function validateTaskInput(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const body = input as Record<string, unknown>;

  if (!isNonEmptyString(body.title)) return { ok: false, error: "title is required" };
  if (!isValidDate(body.deadline)) return { ok: false, error: "deadline must be a valid date" };
  if (!isNonNegativeInteger(body.estimatedMinutes)) {
    return { ok: false, error: "estimatedMinutes must be a non-negative integer" };
  }
  if (typeof body.priority !== "string" || !TASK_PRIORITIES.includes(body.priority as TaskPriority)) {
    return { ok: false, error: `priority must be one of ${TASK_PRIORITIES.join(", ")}` };
  }
  if (typeof body.category !== "string" || !TASK_CATEGORIES.includes(body.category as TaskCategory)) {
    return { ok: false, error: `category must be one of ${TASK_CATEGORIES.join(", ")}` };
  }
  if (body.mode !== "student" && body.mode !== "work") {
    return { ok: false, error: "mode must be 'student' or 'work'" };
  }
  return { ok: true };
}

/**
 * Validate a partial task patch (used by PATCH /api/tasks/[id]).
 * Only validates fields that are present.
 */
export function validateTaskPatch(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const body = input as Record<string, unknown>;

  if ("title" in body && !isNonEmptyString(body.title)) {
    return { ok: false, error: "title must be a non-empty string" };
  }
  if ("deadline" in body && !isValidDate(body.deadline)) {
    return { ok: false, error: "deadline must be a valid date" };
  }
  if ("estimatedMinutes" in body && !isNonNegativeInteger(body.estimatedMinutes)) {
    return { ok: false, error: "estimatedMinutes must be a non-negative integer" };
  }
  if ("completedMinutes" in body && !isNonNegativeInteger(body.completedMinutes)) {
    return { ok: false, error: "completedMinutes must be a non-negative integer" };
  }
  if (
    "priority" in body &&
    (typeof body.priority !== "string" || !TASK_PRIORITIES.includes(body.priority as TaskPriority))
  ) {
    return { ok: false, error: `priority must be one of ${TASK_PRIORITIES.join(", ")}` };
  }
  if (
    "category" in body &&
    (typeof body.category !== "string" || !TASK_CATEGORIES.includes(body.category as TaskCategory))
  ) {
    return { ok: false, error: `category must be one of ${TASK_CATEGORIES.join(", ")}` };
  }
  if ("status" in body && (typeof body.status !== "string" || !TASK_STATUSES.includes(body.status as TaskStatus))) {
    return { ok: false, error: `status must be one of ${TASK_STATUSES.join(", ")}` };
  }
  if ("mode" in body && body.mode !== "student" && body.mode !== "work") {
    return { ok: false, error: "mode must be 'student' or 'work'" };
  }
  if ("projectId" in body) {
    if (body.projectId !== null && !isValidUuid(body.projectId)) {
      return { ok: false, error: "projectId must be a UUID or null" };
    }
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return { ok: false, error: "description must be a string or null" };
    }
  }
  return { ok: true };
}

/**
 * Validate a subtask title (for POST/PATCH subtask routes).
 */
export function validateSubtaskTitle(title: unknown): ValidationResult {
  if (!isNonEmptyString(title)) return { ok: false, error: "title must be a non-empty string" };
  return { ok: true };
}
