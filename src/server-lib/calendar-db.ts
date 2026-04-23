import { DEFAULT_CATEGORIES } from "@/shared/models/calendar";

/**
 * Abstract client the calendar DB helpers operate on. A minimal subset of
 * pg's Client/PoolClient so we can provide an in-memory fake in tests.
 */
export interface TxClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface SeedOptions {
  /** Open a tx-scoped client. Helpers BEGIN/COMMIT on this client. */
  acquireClient: () => Promise<TxClient & { release: () => void | Promise<void> }>;
  /** Run a non-transactional probe query. */
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
}

/**
 * Insert the 4 default categories if the user has none. Uses
 * pg_advisory_xact_lock so two concurrent callers can't both insert.
 *
 * Returns true if this call did the seeding, false otherwise.
 */
export async function seedDefaultCategoriesIfEmpty(
  userId: string,
  opts: SeedOptions,
): Promise<boolean> {
  // Cheap check outside the lock; fast-path when already seeded.
  const existing = await opts.query(
    `SELECT 1 FROM vybe_event_categories WHERE user_email = $1 LIMIT 1`,
    [userId],
  );
  if (existing.length > 0) return false;

  const client = await opts.acquireClient();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`vybe-cat-seed:${userId}`]);
    const recheck = await client.query(
      `SELECT 1 FROM vybe_event_categories WHERE user_email = $1 LIMIT 1`,
      [userId],
    );
    if (recheck.rows.length > 0) {
      await client.query("COMMIT");
      return false;
    }
    for (const c of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO vybe_event_categories (user_email, name, color, is_default)
         VALUES ($1, $2, $3, TRUE)`,
        [userId, c.name, c.color],
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    await client.release();
  }
}

export interface DeleteContext {
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
}

// Optional undefined siblings on the success branch so narrowing works with
// strictNullChecks disabled (same pattern as Validation<T> in shared/models).
export type DeleteResult =
  | { ok: true; status?: undefined; error?: undefined }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Delete a category, reassigning its events per the wave-3 contract:
 * - 404 if not owned / not found.
 * - 400 if the category is a default (is_default = true).
 * - 409 if there are events referencing it and `reassignTo` is undefined.
 * - 400 if `reassignTo` is a non-empty, unknown/non-owned id, or equals `id`.
 * - Otherwise: reassign events (empty string -> NULL; UUID -> that id) and delete.
 */
export async function deleteCategoryWithReassign(
  userId: string,
  id: string,
  reassignTo: string | null | undefined,
  ctx: DeleteContext,
): Promise<DeleteResult> {
  const existing = await ctx.query(
    `SELECT is_default FROM vybe_event_categories WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  if (existing.length === 0) return { ok: false, status: 404, error: "Not found" };

  if (existing[0].is_default === true) {
    return { ok: false, status: 400, error: "Default category cannot be deleted" };
  }

  const countRows = await ctx.query(
    `SELECT COUNT(*)::int AS n FROM vybe_events WHERE user_email = $1 AND category_id = $2`,
    [userId, id],
  );
  const count = (countRows[0]?.n as number | undefined) ?? 0;

  if (count > 0) {
    if (reassignTo === undefined || reassignTo === null) {
      return {
        ok: false,
        status: 409,
        error: `Category has ${count} event(s). Provide reassignTo or an empty value to clear.`,
      };
    }
    if (reassignTo === "") {
      await ctx.query(
        `UPDATE vybe_events SET category_id = NULL, updated_at = NOW()
         WHERE user_email = $1 AND category_id = $2`,
        [userId, id],
      );
    } else {
      if (reassignTo === id) {
        return { ok: false, status: 400, error: "Cannot reassign to the category being deleted" };
      }
      const target = await ctx.query(
        `SELECT 1 FROM vybe_event_categories WHERE id = $1 AND user_email = $2`,
        [reassignTo, userId],
      );
      if (target.length === 0) {
        return { ok: false, status: 400, error: "reassignTo category not found" };
      }
      await ctx.query(
        `UPDATE vybe_events SET category_id = $3, updated_at = NOW()
         WHERE user_email = $1 AND category_id = $2`,
        [userId, id, reassignTo],
      );
    }
  }

  await ctx.query(
    `DELETE FROM vybe_event_categories WHERE id = $1 AND user_email = $2`,
    [id, userId],
  );
  return { ok: true };
}
