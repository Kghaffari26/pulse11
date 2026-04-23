import { sql } from "./neon";

type SqlPrimitive = string | number | boolean | Date | null;
type SqlParam = SqlPrimitive | SqlPrimitive[] | Record<string, unknown>;

/**
 * Query the app's internal Postgres database directly via the Neon serverless client.
 *
 * Historically this helper proxied requests through Vybe's sandbox (vybe.build)
 * using an HTTP client. That dependency has been removed — we now hit Neon
 * directly using the `DATABASE_URL` env var. The function signature is preserved
 * so existing callers (tasks, prefs, sessions, subtasks routes, etc.) keep working
 * without changes.
 *
 * @param query - The SQL to execute, using $1, $2, etc. for parameters
 * @param params - Parameters to bind (primitives, arrays for ANY clauses, or objects for JSONB)
 * @returns Array of result rows
 *
 * @example
 * const rows = await queryInternalDatabase(
 *   "SELECT * FROM pulse_tasks WHERE user_email = $1",
 *   [email]
 * );
 *
 * // ANY clause:
 * await queryInternalDatabase(
 *   "SELECT * FROM pulse_tasks WHERE id = ANY($1)",
 *   [["id1", "id2"]]
 * );
 *
 * // JSONB:
 * await queryInternalDatabase(
 *   "INSERT INTO events (data) VALUES ($1)",
 *   [{ event: "click" }]
 * );
 */
export async function queryInternalDatabase(
  query: string,
  params: SqlParam[] = [],
): Promise<Record<string, unknown>[]> {
  // @neondatabase/serverless exposes `sql(queryString, params)` for parameterized
  // queries when the first arg is a plain string (as opposed to a template literal).
  // It returns the rows array directly.
  const rows = (await sql.query(query, params as unknown[])) as Record<string, unknown>[];
  return rows;
}
