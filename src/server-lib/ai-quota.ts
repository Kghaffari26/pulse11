import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { FREE_TIER_MONTHLY_LIMIT, currentYyyymm } from "@/shared/models/ai";

export interface QuotaStore {
  getCount(userId: string, yyyymm: string): Promise<number>;
  increment(userId: string, yyyymm: string): Promise<number>;
}

/** Default QuotaStore backed by the `vybe_ai_usage_counter` table. */
export const defaultQuotaStore: QuotaStore = {
  async getCount(userId, yyyymm) {
    const rows = await queryInternalDatabase(
      `SELECT count FROM vybe_ai_usage_counter WHERE user_email = $1 AND yyyymm = $2`,
      [userId, yyyymm],
    );
    return (rows[0]?.count as number | undefined) ?? 0;
  },
  async increment(userId, yyyymm) {
    const rows = await queryInternalDatabase(
      `INSERT INTO vybe_ai_usage_counter (user_email, yyyymm, count, updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (user_email, yyyymm) DO UPDATE
         SET count = vybe_ai_usage_counter.count + 1,
             updated_at = NOW()
       RETURNING count`,
      [userId, yyyymm],
    );
    return (rows[0]?.count as number | undefined) ?? 1;
  },
};

export interface QuotaCheck {
  exhausted: boolean;
  used: number;
  remaining: number;
}

/** Non-mutating pre-check so the route can short-circuit before calling AI. */
export async function checkFreeTierQuota(
  userId: string,
  store: QuotaStore = defaultQuotaStore,
  now: Date = new Date(),
): Promise<QuotaCheck> {
  const used = await store.getCount(userId, currentYyyymm(now));
  const remaining = Math.max(0, FREE_TIER_MONTHLY_LIMIT - used);
  return { exhausted: used >= FREE_TIER_MONTHLY_LIMIT, used, remaining };
}

/** Atomic post-call increment. Returns the new count. */
export async function incrementFreeTierUsage(
  userId: string,
  store: QuotaStore = defaultQuotaStore,
  now: Date = new Date(),
): Promise<number> {
  return store.increment(userId, currentYyyymm(now));
}
