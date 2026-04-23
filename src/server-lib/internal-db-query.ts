import { Pool } from "@neondatabase/serverless";

type SqlPrimitive = string | number | boolean | Date | null;
type SqlParam = SqlPrimitive | SqlPrimitive[] | Record<string, unknown>;

// Lazy pool: the env check runs on first query instead of at module load,
// so tests that import transitively (e.g. for type only, or to exercise a
// dependency-injected code path) don't need DATABASE_URL set.
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/**
 * Query the app's internal Postgres database directly via the Neon serverless
 * Pool. Uses DATABASE_URL env var. Signature preserved for existing callers
 * (tasks, prefs, sessions, subtasks).
 */
export async function queryInternalDatabase(
  query: string,
  params: SqlParam[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await getPool().query(query, params as unknown[]);
  return result.rows as Record<string, unknown>[];
}
