import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { defaultJobsStore } from "@/server-lib/agent/jobs-store";

export const runtime = "nodejs";

/**
 * Cooperative cancellation: flips status to 'cancelled'. The executor
 * checks status between steps and exits cleanly when it sees the flip.
 * Already-completed/failed jobs are left alone so idempotent retries
 * from the UI don't clobber final state.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const job = await defaultJobsStore.get(id, userId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json({ ok: true, status: job.status });
  }

  await defaultJobsStore.updateStatus(id, "cancelled");
  return NextResponse.json({ ok: true, status: "cancelled" });
}
