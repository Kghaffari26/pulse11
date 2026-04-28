import { queryInternalDatabase } from "@/server-lib/internal-db-query";

export interface ProjectHit {
  id: string;
  name: string;
  description: string | null;
}

export interface TaskHit {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface NoteHit {
  id: string;
  title: string | null;
  snippet: string | null;
  projectId: string;
  projectName: string;
}

export interface FileHit {
  id: string;
  filename: string;
  projectId: string;
  projectName: string;
}

export interface SearchResults {
  projects: ProjectHit[];
  tasks: TaskHit[];
  notes: NoteHit[];
  files: FileHit[];
}

export const SEARCH_MIN_QUERY = 2;
export const SEARCH_MAX_QUERY = 100;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 10;

const SNIPPET_RADIUS = 40; // chars on each side of the match → ~80-char window

export const EMPTY_RESULTS: SearchResults = {
  projects: [],
  tasks: [],
  notes: [],
  files: [],
};

export interface SearchDeps {
  query?: typeof queryInternalDatabase;
}

/**
 * Build a snippet of `content` that highlights where `q` matches.
 *
 * - Match in content: ~80 chars centered on the first occurrence.
 * - No match in content (matched on title only): first 80 chars of content.
 * - Empty content: null.
 */
export function buildNoteSnippet(content: string | null, q: string): string | null {
  if (!content) return null;
  const lower = content.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) {
    return content.slice(0, SNIPPET_RADIUS * 2).trim() || null;
  }
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(content.length, idx + q.length + SNIPPET_RADIUS);
  const head = start > 0 ? "…" : "";
  const tail = end < content.length ? "…" : "";
  return `${head}${content.slice(start, end).trim()}${tail}`;
}

function clampLimit(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return SEARCH_DEFAULT_LIMIT;
  return Math.max(1, Math.min(SEARCH_MAX_LIMIT, Math.round(input)));
}

/**
 * Run the search across all four surfaces. Caller must pre-validate `q`
 * (trim + min length) — this fn returns EMPTY_RESULTS if q is shorter
 * than SEARCH_MIN_QUERY so handlers can call it unconditionally.
 *
 * Ownership is scoped via user_email on every query; there's no path that
 * leaks rows belonging to other users.
 */
export async function searchAll(
  userId: string,
  rawQuery: string,
  rawLimit: number | undefined,
  deps: SearchDeps = {},
): Promise<SearchResults> {
  const q = (rawQuery ?? "").trim();
  if (q.length < SEARCH_MIN_QUERY) return EMPTY_RESULTS;

  const query = deps.query ?? queryInternalDatabase;
  const limit = clampLimit(rawLimit);
  const pattern = `%${q.toLowerCase()}%`;

  const [projectsRows, tasksRows, notesRows, filesRows] = await Promise.all([
    query(
      `SELECT id, name, description
         FROM vybe_projects
        WHERE user_email = $1
          AND archived = FALSE
          AND (LOWER(name) LIKE $2 OR LOWER(COALESCE(description, '')) LIKE $2)
        ORDER BY updated_at DESC
        LIMIT $3`,
      [userId, pattern, limit],
    ),
    query(
      `SELECT t.id, t.title, t.description, t.project_id, p.name AS project_name
         FROM pulse_tasks t
         LEFT JOIN vybe_projects p ON p.id = t.project_id
        WHERE t.user_email = $1
          AND t.status <> 'completed'
          AND t.status <> 'done'
          AND (LOWER(t.title) LIKE $2 OR LOWER(COALESCE(t.description, '')) LIKE $2)
        ORDER BY t.deadline ASC NULLS LAST, t.updated_at DESC
        LIMIT $3`,
      [userId, pattern, limit],
    ),
    query(
      `SELECT n.id, n.title, n.content_markdown, n.project_id, p.name AS project_name
         FROM vybe_project_notes n
         JOIN vybe_projects p ON p.id = n.project_id
        WHERE n.user_email = $1
          AND p.archived = FALSE
          AND (LOWER(COALESCE(n.title, '')) LIKE $2 OR LOWER(COALESCE(n.content_markdown, '')) LIKE $2)
        ORDER BY n.updated_at DESC
        LIMIT $3`,
      [userId, pattern, limit],
    ),
    query(
      `SELECT f.id, f.filename, f.project_id, p.name AS project_name
         FROM vybe_project_files f
         JOIN vybe_projects p ON p.id = f.project_id
        WHERE f.user_email = $1
          AND p.archived = FALSE
          AND LOWER(f.filename) LIKE $2
        ORDER BY f.uploaded_at DESC
        LIMIT $3`,
      [userId, pattern, limit],
    ),
  ]);

  const projects: ProjectHit[] = projectsRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
  }));

  const tasks: TaskHit[] = tasksRows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    projectName: (r.project_name as string | null) ?? null,
  }));

  const notes: NoteHit[] = notesRows.map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? null,
    snippet: buildNoteSnippet(r.content_markdown as string | null, q),
    projectId: r.project_id as string,
    projectName: r.project_name as string,
  }));

  const files: FileHit[] = filesRows.map((r) => ({
    id: r.id as string,
    filename: r.filename as string,
    projectId: r.project_id as string,
    projectName: r.project_name as string,
  }));

  return { projects, tasks, notes, files };
}
