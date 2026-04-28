import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { defaultJobsStore } from "@/server-lib/agent/jobs-store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const { id } = await params;
  const job = await defaultJobsStore.get(id, userId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}
