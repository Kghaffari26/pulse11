import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { loadUserApiKey } from "@/server-lib/ai-key-store";
import { checkFreeTierQuota } from "@/server-lib/ai-quota";
import { FREE_TIER_MONTHLY_LIMIT } from "@/shared/models/ai";

export const runtime = "nodejs";

/** Public summary of the caller's AI access — drives the <AILocked /> UI. */
export async function GET() {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const key = await loadUserApiKey(userId);
  if (key) {
    return NextResponse.json({
      tier: "byok" as const,
      locked: false,
      remaining: null,
      limit: null,
    });
  }

  const quota = await checkFreeTierQuota(userId);
  return NextResponse.json({
    tier: "free" as const,
    locked: quota.exhausted,
    remaining: quota.remaining,
    limit: FREE_TIER_MONTHLY_LIMIT,
  });
}
