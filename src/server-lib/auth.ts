import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Returns the authenticated user's Clerk ID, or a 401 JSON response.
 *
 * Usage in a route handler:
 *   const gate = await requireUserId();
 *   if (gate instanceof NextResponse) return gate;
 *   const userId = gate;
 *
 * The returned `userId` is a Clerk-issued opaque string (e.g. `user_2abc...`)
 * that we store in the `user_email` column of all pulse_* tables. Column is a
 * misnomer now but the data is correctly scoped per authenticated user.
 */
export async function requireUserId(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return userId;
}
