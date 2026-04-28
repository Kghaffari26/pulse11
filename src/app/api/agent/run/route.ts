import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { defaultJobsStore } from "@/server-lib/agent/jobs-store";
import { runAgentJob } from "@/server-lib/agent/executor";
import { validateAgentGoal } from "@/shared/models/ai";

export const runtime = "nodejs";

interface RequestBody {
  goal: string;
  context?: Record<string, unknown>;
}

/**
 * Queue an agent run. The row is created synchronously and the HTTP
 * response returns {jobId} immediately; the executor is kicked off via
 * setImmediate so the client can start polling /api/agent/jobs/[id]
 * while the request handler returns.
 *
 * Wave 4A stays Vercel-native by design — no QStash, no BullMQ. If a
 * serverless instance is reclaimed mid-run the job row is left in the
 * 'running' state; Wave 4B can add a stuck-job reaper when we layer in
 * real tools.
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

  const v = validateAgentGoal(body.goal);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const job = await defaultJobsStore.create(userId, v.value, body.context ?? null);

  // Fire-and-forget. The executor records failure into the job row, so the
  // promise settling is not something the route cares about — but we still
  // attach a catch handler so an unhandled rejection doesn't tear down the
  // Node process on non-serverless runtimes.
  setImmediate(() => {
    runAgentJob(job.id).catch((err) => {
      console.error("[agent] uncaught executor error", job.id, err);
    });
  });

  return NextResponse.json({ jobId: job.id });
}
