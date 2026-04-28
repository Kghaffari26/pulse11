// Orchestration for the /api/ai-assist endpoint:
//   1) Try Gemini.
//   2) If Gemini fails with a retryable status (429 / 503 / 5xx) or a
//      network error, retry once after 250 ms.
//   3) If Gemini is still failing, fall through to OpenAI (single attempt).
//   4) If both providers fail — or no provider is configured — return a
//      503 with a structured error.
//
// Deps (fetch, sleep) are injected so tests can exercise the retry /
// fallback paths without real HTTP.

export type AiAssistResult =
  | { ok: true; text: string; provider: "gemini" | "openai"; error?: undefined; status?: undefined }
  | { ok: false; status: number; error: string; text?: undefined; provider?: undefined };

export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro";

export interface AiAssistConfig {
  geminiKey?: string;
  openaiKey?: string;
  prompt: string;
  /** Defaults to gemini-2.5-flash. BYOK callers pass gemini-2.5-pro. */
  geminiModel?: GeminiModel;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

interface ProviderAttempt {
  ok: true;
  text: string;
  retryable?: undefined;
  error?: undefined;
}
interface ProviderFail {
  ok: false;
  retryable: boolean;
  error: string;
  text?: undefined;
}
type ProviderOutcome = ProviderAttempt | ProviderFail;

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = 250;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const candidates = d.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const first = candidates[0] as Record<string, unknown> | undefined;
  const content = first?.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  const pieces: string[] = [];
  for (const p of parts) {
    if (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string") {
      pieces.push((p as { text: string }).text);
    }
  }
  return pieces.join("");
}

function extractOpenAIText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const choices = d.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" ? content : "";
}

async function callGeminiOnce(
  apiKey: string,
  prompt: string,
  fetchFn: typeof fetch,
  model: GeminiModel = "gemini-2.5-flash",
): Promise<ProviderOutcome> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return {
        ok: false,
        retryable: RETRYABLE_STATUSES.has(res.status),
        error: `Gemini ${res.status}: ${bodyText.slice(0, 300)}`,
      };
    }
    const data = (await res.json().catch(() => null)) as unknown;
    const text = extractGeminiText(data);
    if (!text) return { ok: false, retryable: false, error: "Gemini returned an empty response" };
    return { ok: true, text };
  } catch (err) {
    // Network-level failure — retry-worthy.
    return {
      ok: false,
      retryable: true,
      error: err instanceof Error ? err.message : "Gemini request failed",
    };
  }
}

async function callOpenAIOnce(
  apiKey: string,
  prompt: string,
  fetchFn: typeof fetch,
): Promise<ProviderOutcome> {
  try {
    const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a focused study / productivity assistant. Produce clear, well-structured, useful responses. Use markdown where helpful.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return {
        ok: false,
        retryable: false, // OpenAI is the fallback — no further retry.
        error: `OpenAI ${res.status}: ${bodyText.slice(0, 300)}`,
      };
    }
    const data = (await res.json().catch(() => null)) as unknown;
    const text = extractOpenAIText(data);
    if (!text) return { ok: false, retryable: false, error: "OpenAI returned an empty response" };
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      retryable: false,
      error: err instanceof Error ? err.message : "OpenAI request failed",
    };
  }
}

export async function aiAssist(cfg: AiAssistConfig): Promise<AiAssistResult> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const sleepFn = cfg.sleepFn ?? defaultSleep;

  const errors: string[] = [];

  if (cfg.geminiKey) {
    const model = cfg.geminiModel ?? "gemini-2.5-flash";
    let first = await callGeminiOnce(cfg.geminiKey, cfg.prompt, fetchFn, model);
    if (first.ok) return { ok: true, text: first.text, provider: "gemini" };
    errors.push(first.error);
    if (first.retryable) {
      await sleepFn(BACKOFF_MS);
      const second = await callGeminiOnce(cfg.geminiKey, cfg.prompt, fetchFn, model);
      if (second.ok) return { ok: true, text: second.text, provider: "gemini" };
      errors.push(second.error);
    }
  }

  if (cfg.openaiKey) {
    const openai = await callOpenAIOnce(cfg.openaiKey, cfg.prompt, fetchFn);
    if (openai.ok) return { ok: true, text: openai.text, provider: "openai" };
    errors.push(openai.error);
  }

  if (!cfg.geminiKey && !cfg.openaiKey) {
    return {
      ok: false,
      status: 503,
      error:
        "No AI provider configured. Set GOOGLE_GEMINI_API_KEY or OPENAI_API_KEY.",
    };
  }

  return {
    ok: false,
    status: 503,
    error: `AI providers unavailable: ${errors.join(" | ").slice(0, 500)}`,
  };
}
