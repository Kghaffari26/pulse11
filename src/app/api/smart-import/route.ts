import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RequestBody {
  mode: "text" | "image";
  prompt: string; // fully-built prompt from the client, including schema instruction
  imageBase64?: string; // raw base64 (no data: prefix) for image mode
}

/**
 * Smart Import endpoint.
 *
 * - "text" mode: uses Google Gemini (GOOGLE_GEMINI_API_KEY) if available, else falls back to OpenAI.
 * - "image" mode: uses OpenAI (OPENAI_API_KEY) with gpt-4o-mini vision. Gemini vision via free tier is flaky.
 *
 * Returns { text: string } — raw model output. Client does JSON extraction + validation.
 */
export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, prompt, imageBase64 } = body;
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  try {
    if (mode === "image") {
      if (!imageBase64) {
        return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
      }
      if (!openaiKey) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY is not configured on the server. Required for screenshot analysis." },
          { status: 500 },
        );
      }
      const text = await callOpenAIVision({
        apiKey: openaiKey,
        prompt,
        imageBase64,
      });
      return NextResponse.json({ text });
    }

    // text mode
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
    console.error("[smart-import] error:", err);
    const message = err instanceof Error ? err.message : "Smart import failed";
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
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 500)}`);
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
            "You extract structured task data from Canvas / LMS assignment descriptions. Always respond with valid JSON matching the requested schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data: unknown = await res.json();
  const text = extractOpenAIText(data);
  if (!text) throw new Error("OpenAI returned an empty response");
  return text;
}

async function callOpenAIVision({
  apiKey,
  prompt,
  imageBase64,
}: {
  apiKey: string;
  prompt: string;
  imageBase64: string;
}): Promise<string> {
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
            "You extract structured task data from screenshots of learning management systems like Canvas. Always respond with valid JSON matching the requested schema.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI vision request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data: unknown = await res.json();
  const text = extractOpenAIText(data);
  if (!text) throw new Error("OpenAI vision returned an empty response");
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
