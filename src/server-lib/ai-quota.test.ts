import type { QuotaStore } from "./ai-quota";
import { checkFreeTierQuota, incrementFreeTierUsage } from "./ai-quota";
import { FREE_TIER_MONTHLY_LIMIT, currentYyyymm } from "@/shared/models/ai";

function memoryStore(): QuotaStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  const key = (user: string, yyyymm: string) => `${user}|${yyyymm}`;
  return {
    rows,
    async getCount(user, yyyymm) {
      return rows.get(key(user, yyyymm)) ?? 0;
    },
    async increment(user, yyyymm) {
      const k = key(user, yyyymm);
      const next = (rows.get(k) ?? 0) + 1;
      rows.set(k, next);
      return next;
    },
  };
}

describe("checkFreeTierQuota", () => {
  test("fresh user is not exhausted and has the full allowance remaining", async () => {
    const store = memoryStore();
    const r = await checkFreeTierQuota("u-1", store);
    expect(r).toEqual({ exhausted: false, used: 0, remaining: FREE_TIER_MONTHLY_LIMIT });
  });

  test("user at the limit is exhausted", async () => {
    const store = memoryStore();
    store.rows.set(`u-1|${currentYyyymm()}`, FREE_TIER_MONTHLY_LIMIT);
    const r = await checkFreeTierQuota("u-1", store);
    expect(r.exhausted).toBe(true);
    expect(r.remaining).toBe(0);
  });

  test("count is scoped to the current yyyymm — last month's usage does not leak", async () => {
    const store = memoryStore();
    const lastMonth = new Date(2026, 2, 15); // March
    const thisMonth = new Date(2026, 3, 1); // April
    store.rows.set(`u-1|${currentYyyymm(lastMonth)}`, FREE_TIER_MONTHLY_LIMIT);
    const r = await checkFreeTierQuota("u-1", store, thisMonth);
    expect(r.exhausted).toBe(false);
    expect(r.used).toBe(0);
  });
});

describe("incrementFreeTierUsage", () => {
  test("sequential increments return the new count each time", async () => {
    const store = memoryStore();
    expect(await incrementFreeTierUsage("u-1", store)).toBe(1);
    expect(await incrementFreeTierUsage("u-1", store)).toBe(2);
    expect(await incrementFreeTierUsage("u-1", store)).toBe(3);
  });

  test("concurrent increments all land without loss", async () => {
    const store = memoryStore();
    const tasks = Array.from({ length: 10 }, () => incrementFreeTierUsage("u-1", store));
    await Promise.all(tasks);
    const after = await checkFreeTierQuota("u-1", store);
    expect(after.used).toBe(10);
  });

  test("clock-mocked increment writes to the correct month bucket", async () => {
    const store = memoryStore();
    const march = new Date(2026, 2, 15);
    const april = new Date(2026, 3, 1);
    await incrementFreeTierUsage("u-1", store, march);
    await incrementFreeTierUsage("u-1", store, april);
    expect(store.rows.get(`u-1|${currentYyyymm(march)}`)).toBe(1);
    expect(store.rows.get(`u-1|${currentYyyymm(april)}`)).toBe(1);
  });
});
