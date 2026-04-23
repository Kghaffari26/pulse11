import { sql } from "./neon";

type SqlPrimitive = string | number | boolean | Date | null;
type SqlParam = SqlPrimitive | SqlPrimitive[] | Record<string, unknown>;

// The @neondatabase/serverless `sql` function is typed as a tagged-template
// function (NeonQueryFunction<false, false>) but at runtime it also exposes a
// `.query(queryString, params)` method for parameterized plain-string queries.
// The types don't advertise this, so we narrow to a minimal local shape.
type NeonSqlWithQuery = {
  query: (
    queryString: string,
    params?: unknown[],
  ) => Promise<Record<string, unknown>[]>;
};

/**
 * Query the app's internal Postgres database directly via the Neon serverless client.
 * Uses DATABASE_URL env var. Signature preserved for existing callers
 * (tasks, prefs, sessions, subtasks).
 */
export async function queryInternalDatabase(
  query: string,
  params: SqlParam[] = [],
): Promise<Record<string, unknown>[]> {
  const client = sql as unknown as NeonSqlWithQuery;
  const rows = await client.query(query, params as unknown[]);
  return rows;
}
