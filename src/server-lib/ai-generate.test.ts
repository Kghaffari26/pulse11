import { aiGenerate } from "./ai-generate";
import type { QuotaStore } from "./ai-quota";
import type { AiAssistResult } from "./ai-assist";
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

describe("aiGenerate", () => {
  test("BYOK path uses the user's key against gemini-2.5-pro and skips quota", async () => {
    const store = memoryStore();
    let calledWith: { key?: string; model?: string } = {};
    const assist: typeof import("./ai-assist").aiAssist = async (cfg) => {
      calledWith = { key: cfg.geminiKey, model: cfg.geminiModel };
      return { ok: true, text: "byok result", provider: "gemini" } as AiAssistResult;
    };

    const r = await aiGenerate({
      userId: "u-1",
      prompt: "hi",
      loadKey: async () => "user-key-123",
      quotaStore: store,
      assist,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tier).toBe("byok");
      expect(r.model).toBe("gemini-2.5-pro");
      expect(r.text).toBe("byok result");
      expect(r.remainingFreeTier).toBeUndefined();
    }
    expect(calledWith.key).toBe("user-key-123");
    expect(calledWith.model).toBe("gemini-2.5-pro");
    // Quota untouched.
    expect(store.rows.size).toBe(0);
  });

  test("free-tier path uses the house key on flash and increments after success", async () => {
    const store = memoryStore();
    let calledWith: { key?: string; model?: string } = {};
    const assist: typeof import("./ai-assist").aiAssist = async (cfg) => {
      calledWith = { key: cfg.geminiKey, model: cfg.geminiModel };
      return { ok: true, text: "free result", provider: "gemini" } as AiAssistResult;
    };

    const r = await aiGenerate({
      userId: "u-1",
      prompt: "hi",
      loadKey: async () => null,
      quotaStore: store,
      assist,
      houseGeminiKey: "HOUSE-KEY",
      houseOpenaiKey: "HOUSE-OPENAI",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tier).toBe("free");
      expect(r.model).toBe("gemini-2.5-flash");
      expect(r.remainingFreeTier).toBe(FREE_TIER_MONTHLY_LIMIT - 1);
    }
    expect(calledWith.key).toBe("HOUSE-KEY");
    expect(calledWith.model).toBe("gemini-2.5-flash");
    expect(store.rows.get(`u-1|${currentYyyymm()}`)).toBe(1);
  });

  test("exhausted free tier short-circuits with 429 and does NOT call the provider", async () => {
    const store = memoryStore();
    store.rows.set(`u-1|${currentYyyymm()}`, FREE_TIER_MONTHLY_LIMIT);
    let assistCalls = 0;
    const assist: typeof import("./ai-assist").aiAssist = async () => {
      assistCalls++;
      return { ok: true, text: "should not happen", provider: "gemini" } as AiAssistResult;
    };

    const r = await aiGenerate({
      userId: "u-1",
      prompt: "hi",
      loadKey: async () => null,
      quotaStore: store,
      assist,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(429);
      expect(r.type).toBe("quota_exhausted");
      expect(r.remainingFreeTier).toBe(0);
    }
    expect(assistCalls).toBe(0);
    // Counter unchanged.
    expect(store.rows.get(`u-1|${currentYyyymm()}`)).toBe(FREE_TIER_MONTHLY_LIMIT);
  });

  test("provider failure on free tier does NOT consume the quota", async () => {
    const store = memoryStore();
    const assist: typeof import("./ai-assist").aiAssist = async () => {
      return { ok: false, status: 503, error: "provider dead" } as AiAssistResult;
    };
    const r = await aiGenerate({
      userId: "u-1",
      prompt: "hi",
      loadKey: async () => null,
      quotaStore: store,
      assist,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
    expect(store.rows.size).toBe(0);
  });

  test("BYOK provider failure surfaces cleanly (no quota involvement)", async () => {
    const store = memoryStore();
    const assist: typeof import("./ai-assist").aiAssist = async () => {
      return { ok: false, status: 503, error: "their key is rate-limited" } as AiAssistResult;
    };
    const r = await aiGenerate({
      userId: "u-1",
      prompt: "hi",
      loadKey: async () => "user-key",
      quotaStore: store,
      assist,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(503);
      expect(r.type).toBe("provider_error");
    }
    expect(store.rows.size).toBe(0);
  });
});
