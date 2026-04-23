export interface Project {
  id: string;
  userEmail: string;
  name: string;
  color: string | null;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface ProjectPatch {
  name?: string;
  color?: string | null;
  description?: string | null;
  archived?: boolean;
}

export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESCRIPTION_MAX = 500;
export const PROJECT_COLOR_MAX = 32;
export const PROJECT_ACTIVE_LIMIT = 20;

// Narrow-friendly discriminated union (the extra optional field on each
// branch keeps narrowing reliable when strictNullChecks is disabled).
export type Validation<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: string; value?: undefined };

export function validateProjectInput(input: unknown): Validation<ProjectInput> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid project input" };
  const obj = input as Record<string, unknown>;

  const name = obj.name;
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "Name is required" };
  if (name.trim().length > PROJECT_NAME_MAX) {
    return { ok: false, error: `Name must be <= ${PROJECT_NAME_MAX} characters` };
  }

  const color = obj.color;
  if (color != null && (typeof color !== "string" || color.length > PROJECT_COLOR_MAX)) {
    return { ok: false, error: "Invalid color" };
  }

  const description = obj.description;
  if (
    description != null &&
    (typeof description !== "string" || description.length > PROJECT_DESCRIPTION_MAX)
  ) {
    return { ok: false, error: `Description must be <= ${PROJECT_DESCRIPTION_MAX} characters` };
  }

  return {
    ok: true,
    value: {
      name: name.trim(),
      color: typeof color === "string" && color ? color : null,
      description: typeof description === "string" && description ? description : null,
    },
  };
}

export function validateProjectPatch(patch: unknown): Validation<ProjectPatch> {
  if (!patch || typeof patch !== "object") return { ok: false, error: "Invalid patch" };
  const obj = patch as Record<string, unknown>;
  const out: ProjectPatch = {};

  if ("name" in obj) {
    if (typeof obj.name !== "string" || !obj.name.trim()) return { ok: false, error: "Name is required" };
    if (obj.name.trim().length > PROJECT_NAME_MAX) {
      return { ok: false, error: `Name must be <= ${PROJECT_NAME_MAX} characters` };
    }
    out.name = obj.name.trim();
  }
  if ("color" in obj) {
    if (obj.color != null && (typeof obj.color !== "string" || (obj.color as string).length > PROJECT_COLOR_MAX)) {
      return { ok: false, error: "Invalid color" };
    }
    out.color = typeof obj.color === "string" && obj.color ? (obj.color as string) : null;
  }
  if ("description" in obj) {
    if (
      obj.description != null &&
      (typeof obj.description !== "string" || (obj.description as string).length > PROJECT_DESCRIPTION_MAX)
    ) {
      return { ok: false, error: `Description must be <= ${PROJECT_DESCRIPTION_MAX} characters` };
    }
    out.description = typeof obj.description === "string" && obj.description ? (obj.description as string) : null;
  }
  if ("archived" in obj) {
    if (typeof obj.archived !== "boolean") return { ok: false, error: "archived must be boolean" };
    out.archived = obj.archived;
  }

  return { ok: true, value: out };
}
