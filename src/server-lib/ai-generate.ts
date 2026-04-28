import { aiAssist, type AiAssistResult } from "./ai-assist";
import { loadUserApiKey } from "./ai-key-store";
import {
  checkFreeTierQuota,
  defaultQuotaStore,
  incrementFreeTierUsage,
  type QuotaStore,
} from "./ai-quota";
import { FREE_TIER_MONTHLY_LIMIT } from "@/shared/models/ai";

export type AiGenerateResult =
  | {
      ok: true;
      text: string;
      provider: "gemini" | "openai";
      tier: "byok" | "free";
      model: "gemini-2.5-flash" | "gemini-2.5-pro";
      remainingFreeTier?: number;
      error?: undefined;
      status?: undefined;
      type?: undefined;
    }
  | {
      ok: false;
      status: number;
      error: string;
      type?: "quota_exhausted" | "provider_error";
      text?: undefined;
      provider?: undefined;
      tier?: undefined;
      model?: undefined;
      remainingFreeTier?: number;
    };

export interface AiGenerateOptions {
  userId: string;
  prompt: string;
  /** Dependency hooks — tests swap these without hitting real systems. */
  loadKey?: (userId: string) => Promise<string | null>;
  quotaStore?: QuotaStore;
  assist?: typeof aiAssist;
  houseGeminiKey?: string;
  houseOpenaiKey?: string;
  now?: Date;
}

/**
 * Hybrid policy: if the user has a stored key, use gemini-2.5-pro with
 * *their* key and no quota accounting. Otherwise, check the free-tier
 * counter, call the house key on gemini-2.5-flash (OpenAI fallback),
 * increment only on success.
 */
export async function aiGenerate(opts: AiGenerateOptions): Promise<AiGenerateResult> {
  const loadKey = opts.loadKey ?? loadUserApiKey;
  const quotaStore = opts.quotaStore ?? defaultQuotaStore;
  const assist = opts.assist ?? aiAssist;
  const now = opts.now ?? new Date();

  const userKey = await loadKey(opts.userId);

  if (userKey) {
    // BYOK: user pays for their own usage. Use the higher-quality model.
    // No OpenAI fallback — it's the user's own key on the line.
    const result: AiAssistResult = await assist({
      geminiKey: userKey,
      prompt: opts.prompt,
      geminiModel: "gemini-2.5-pro",
    });
    if (result.ok) {
      return {
        ok: true,
        text: result.text,
        provider: result.provider,
        tier: "byok",
        model: "gemini-2.5-pro",
      };
    }
    return { ok: false, status: result.status, error: result.error, type: "provider_error" };
  }

  // Free tier: pre-check quota before calling AI.
  const pre = await checkFreeTierQuota(opts.userId, quotaStore, now);
  if (pre.exhausted) {
    return {
      ok: false,
      status: 429,
      error: "Monthly free tier exhausted. Add your API key in Settings.",
      type: "quota_exhausted",
      remainingFreeTier: 0,
    };
  }

  const result: AiAssistResult = await assist({
    geminiKey: opts.houseGeminiKey ?? process.env.GOOGLE_GEMINI_API_KEY,
    openaiKey: opts.houseOpenaiKey ?? process.env.OPENAI_API_KEY,
    prompt: opts.prompt,
    geminiModel: "gemini-2.5-flash",
  });

  if (!result.ok) {
    // Don't charge the user's quota for an infra failure.
    return { ok: false, status: result.status, error: result.error, type: "provider_error" };
  }

  const newCount = await incrementFreeTierUsage(opts.userId, quotaStore, now);
  return {
    ok: true,
    text: result.text,
    provider: result.provider,
    tier: "free",
    model: "gemini-2.5-flash",
    remainingFreeTier: Math.max(0, FREE_TIER_MONTHLY_LIMIT - newCount),
  };
}
