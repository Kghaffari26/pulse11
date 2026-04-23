import { Pool } from "@neondatabase/serverless";

type SqlPrimitive = string | number | boolean | Date | null;
type SqlParam = SqlPrimitive | SqlPrimitive[] | Record<string, unknown>;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Module-scoped pool so serverless functions reuse the same instance across
// warm invocations. The Neon serverless Pool speaks the Postgres wire protocol
// over WebSockets and exposes a standard pg-style `.query(sql, params)` API.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Query the app's internal Postgres database directly via the Neon serverless
 * Pool. Uses DATABASE_URL env var. Signature preserved for existing callers
 * (tasks, prefs, sessions, subtasks).
 */
export async function queryInternalDatabase(
  query: string,
  params: SqlParam[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await pool.query(query, params as unknown[]);
  return result.rows as Record<string, unknown>[];
}
