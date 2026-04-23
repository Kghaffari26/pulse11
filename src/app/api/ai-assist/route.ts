import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";

export const runtime = "nodejs";

interface RequestBody {
  prompt: string;
}

/**
 * AI Assist endpoint — free-form text generation for task help
 * (outlines, drafts, study guides, brainstorming, etc.).
 *
 * Prefers Gemini (free tier) and falls back to OpenAI. Plain text out,
 * no JSON coercion — the UI renders the model's prose directly.
 *
 * Auth: gated by Clerk via requireUserId().
 */
export async function POST(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt } = body;
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  try {
    if (geminiKey) {
      const text = await callGeminiText({ apiKey: geminiKey, prompt });
      return NextResponse.json({ text });
    }
    if (openaiKey) {
      const text = await callOpenAIText({ apiKey: openaiKey, prompt });
      return NextResponse.json({ text });
    }
    return NextResponse.json(
      { error: "No AI provider configured. Set GOOGLE_GEMINI_API_KEY or OPENAI_API_KEY." },
      { status: 500 },
    );
  } catch (err) {
    console.error("[ai-assist] error:", err);
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callGeminiText({ apiKey, prompt }: { apiKey: string; prompt: string }): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${raw.slice(0, 500)}`);
  }
  const data: unknown = await res.json();
  const text = extractGeminiText(data);
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function callOpenAIText({ apiKey, prompt }: { apiKey: string; prompt: string }): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
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
    const raw = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${raw.slice(0, 500)}`);
  }
  const data: unknown = await res.json();
  const text = extractOpenAIText(data);
  if (!text) throw new Error("OpenAI returned an empty response");
  return text;
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
  const texts: string[] = [];
  for (const p of parts) {
    if (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string") {
      texts.push((p as { text: string }).text);
    }
  }
  return texts.join("");
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
