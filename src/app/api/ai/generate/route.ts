import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { aiGenerate } from "@/server-lib/ai-generate";

export const runtime = "nodejs";

interface RequestBody {
  prompt: string;
  context?: Record<string, unknown>;
}

/**
 * Hybrid AI gateway used by every AI-backed feature in the app.
 *
 *  - If the caller has a stored Gemini API key, their key is used against
 *    gemini-2.5-pro and no quota is charged.
 *  - Otherwise we run against the house key on gemini-2.5-flash (with the
 *    existing OpenAI fallback) and increment the monthly free-tier counter.
 *
 * The decrypted BYOK key never appears in the response body; only the
 * resolved text and metadata about tier/model.
 */
export async function POST(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const effective = body.context
    ? `${body.prompt}\n\n---\nContext:\n${JSON.stringify(body.context)}`
    : body.prompt;

  const result = await aiGenerate({ userId, prompt: effective });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        type: result.type,
        ...(result.remainingFreeTier !== undefined
          ? { remainingFreeTier: result.remainingFreeTier }
          : {}),
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    text: result.text,
    provider: result.provider,
    tier: result.tier,
    model: result.model,
    ...(result.remainingFreeTier !== undefined
      ? { remainingFreeTier: result.remainingFreeTier }
      : {}),
  });
}
