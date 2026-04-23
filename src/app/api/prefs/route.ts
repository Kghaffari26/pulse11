import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import type { UserPrefs } from "@/shared/models/pulse";

export async function GET() {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const rows = await queryInternalDatabase(`SELECT * FROM pulse_user_prefs WHERE user_email = $1`, [userId]);
  const row = rows[0];
  if (!row) {
    const defaults: UserPrefs = {
      userEmail: userId,
      mode: "student",
      aggressiveAlerts: false,
      notificationsEnabled: true,
    };
    return NextResponse.json(defaults);
  }
  return NextResponse.json({
    userEmail: row.user_email as string,
    mode: row.mode as UserPrefs["mode"],
    aggressiveAlerts: row.aggressive_alerts as boolean,
    notificationsEnabled: (row.notifications_enabled as boolean | null) ?? true,
  });
}

export async function PATCH(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const body = (await req.json()) as Partial<Pick<UserPrefs, "mode" | "aggressiveAlerts" | "notificationsEnabled">>;
  await queryInternalDatabase(
    `INSERT INTO pulse_user_prefs (user_email, mode, aggressive_alerts, notifications_enabled)
     VALUES ($1, COALESCE($2, 'student'), COALESCE($3, FALSE), COALESCE($4, TRUE))
     ON CONFLICT (user_email) DO UPDATE SET
       mode = COALESCE($2, pulse_user_prefs.mode),
       aggressive_alerts = COALESCE($3, pulse_user_prefs.aggressive_alerts),
       notifications_enabled = COALESCE($4, pulse_user_prefs.notifications_enabled),
       updated_at = NOW()`,
    [userId, body.mode ?? null, body.aggressiveAlerts ?? null, body.notificationsEnabled ?? null],
  );
  return NextResponse.json({ ok: true });
}
