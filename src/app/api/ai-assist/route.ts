import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { aiAssist } from "@/server-lib/ai-assist";

export const runtime = "nodejs";

interface RequestBody {
  prompt: string;
}

/**
 * AI Assist endpoint — free-form text generation for task help
 * (outlines, drafts, study guides, brainstorming, etc.).
 *
 * Orchestration lives in @/server-lib/ai-assist: Gemini with a single
 * retry on 429/5xx (250ms backoff), then OpenAI fallback, then a
 * clean 503 JSON. Auth is gated by Clerk via requireUserId().
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

  const result = await aiAssist({
    geminiKey: process.env.GOOGLE_GEMINI_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    prompt,
  });

  if (result.ok) {
    return NextResponse.json({ text: result.text, provider: result.provider });
  }

  console.error("[ai-assist] double-fail:", result.error);
  return NextResponse.json({ error: result.error }, { status: result.status });
}
