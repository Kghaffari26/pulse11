import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import {
  EMPTY_RESULTS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_QUERY,
  SEARCH_MIN_QUERY,
  searchAll,
} from "@/server-lib/search";

export const runtime = "nodejs";

/**
 * GET /api/search?q=...&limit=...
 *
 * Auth-gated, owner-scoped global search across projects, tasks, notes,
 * and files. Short queries (q < SEARCH_MIN_QUERY after trim) return an
 * empty payload rather than 400 — the palette can call this on every
 * keystroke without needing to gate on length client-side.
 */
export async function GET(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const url = new URL(req.url);
  const rawQ = (url.searchParams.get("q") ?? "").trim();
  const q = rawQ.slice(0, SEARCH_MAX_QUERY);

  if (q.length < SEARCH_MIN_QUERY) {
    return NextResponse.json({ query: q, results: EMPTY_RESULTS });
  }

  const limitParam = url.searchParams.get("limit");
  const limitNum = limitParam == null ? SEARCH_DEFAULT_LIMIT : Number.parseInt(limitParam, 10);
  const limit = Number.isFinite(limitNum)
    ? Math.max(1, Math.min(SEARCH_MAX_LIMIT, limitNum))
    : SEARCH_DEFAULT_LIMIT;

  const results = await searchAll(userId, q, limit);
  return NextResponse.json({ query: q, results });
}
