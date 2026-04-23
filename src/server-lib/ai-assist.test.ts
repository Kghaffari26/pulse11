import { aiAssist } from "./ai-assist";

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function geminiSuccess(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });
}

function openaiSuccess(content: string): Response {
  return jsonResponse({ choices: [{ message: { content } }] });
}

function sequencedFetch(responses: Array<Response | (() => Response | Promise<Response>)>) {
  let i = 0;
  const calls: FetchArgs[] = [];
  const fn = (async (...args: FetchArgs) => {
    calls.push(args);
    const next = responses[i++];
    if (!next) throw new Error(`Unexpected extra fetch call #${i}`);
    const res = typeof next === "function" ? await next() : next;
    return res;
  }) as unknown as typeof fetch;
  return { fn, calls, remaining: () => responses.length - i };
}

describe("aiAssist fallback orchestration", () => {
  const sleepNoop = () => Promise.resolve();

  it("returns Gemini text on first-try success without retrying", async () => {
    const { fn, calls } = sequencedFetch([geminiSuccess("hi from gemini")]);
    const result = await aiAssist({
      geminiKey: "g",
      openaiKey: "o",
      prompt: "hello",
      fetchFn: fn,
      sleepFn: sleepNoop,
    });
    expect(result).toEqual({ ok: true, text: "hi from gemini", provider: "gemini" });
    expect(calls).toHaveLength(1);
    expect((calls[0]?.[0] as string).includes("generativelanguage.googleapis.com")).toBe(true);
  });

  it("retries Gemini once on 503 then returns success", async () => {
    const { fn, calls } = sequencedFetch([
      new Response("rate", { status: 503 }),
      geminiSuccess("recovered"),
    ]);
    let sleepCalls = 0;
    const sleepFn = (ms: number) => {
      sleepCalls += 1;
      expect(ms).toBe(250);
      return Promise.resolve();
    };
    const result = await aiAssist({
      geminiKey: "g",
      openaiKey: "o",
      prompt: "p",
      fetchFn: fn,
      sleepFn,
    });
    expect(result).toEqual({ ok: true, text: "recovered", provider: "gemini" });
    expect(calls).toHaveLength(2);
    expect(sleepCalls).toBe(1);
  });

  it("falls through to OpenAI when Gemini fails twice with 503", async () => {
    const { fn, calls } = sequencedFetch([
      new Response("boom", { status: 503 }),
      new Response("boom", { status: 503 }),
      openaiSuccess("openai says hi"),
    ]);
    const result = await aiAssist({
      geminiKey: "g",
      openaiKey: "o",
      prompt: "p",
      fetchFn: fn,
      sleepFn: sleepNoop,
    });
    expect(result).toEqual({ ok: true, text: "openai says hi", provider: "openai" });
    expect(calls).toHaveLength(3);
    expect((calls[2]?.[0] as string).includes("api.openai.com")).toBe(true);
  });

  it("returns 503 (not 500) when both providers fail", async () => {
    const { fn } = sequencedFetch([
      new Response("g-down", { status: 503 }),
      new Response("g-still-down", { status: 503 }),
      new Response("o-bad", { status: 500 }),
    ]);
    const result = await aiAssist({
      geminiKey: "g",
      openaiKey: "o",
      prompt: "p",
      fetchFn: fn,
      sleepFn: sleepNoop,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toMatch(/Gemini/i);
      expect(result.error).toMatch(/OpenAI/i);
    }
  });

  it("retries on network error as well, not just HTTP 5xx", async () => {
    const { fn, calls } = sequencedFetch([
      () => Promise.reject(new Error("socket hang up")),
      geminiSuccess("ok after retry"),
    ]);
    const result = await aiAssist({
      geminiKey: "g",
      prompt: "p",
      fetchFn: fn,
      sleepFn: sleepNoop,
    });
    expect(result).toEqual({ ok: true, text: "ok after retry", provider: "gemini" });
    expect(calls).toHaveLength(2);
  });

  it("does NOT retry on 4xx from Gemini (falls straight to OpenAI)", async () => {
    const { fn, calls } = sequencedFetch([
      new Response("bad request", { status: 400 }),
      openaiSuccess("openai backup"),
    ]);
    const result = await aiAssist({
      geminiKey: "g",
      openaiKey: "o",
      prompt: "p",
      fetchFn: fn,
      sleepFn: sleepNoop,
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2); // no retry between Gemini 400 and OpenAI
  });

  it("returns 503 when no provider is configured", async () => {
    const result = await aiAssist({ prompt: "p" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toMatch(/No AI provider/i);
    }
  });

  it("uses OpenAI only (no retry chain) when Gemini key is absent", async () => {
    const { fn, calls } = sequencedFetch([openaiSuccess("only-openai")]);
    const result = await aiAssist({
      openaiKey: "o",
      prompt: "p",
      fetchFn: fn,
      sleepFn: sleepNoop,
    });
    expect(result).toEqual({ ok: true, text: "only-openai", provider: "openai" });
    expect(calls).toHaveLength(1);
  });
});
