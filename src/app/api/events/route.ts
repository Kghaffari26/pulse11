import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { validateEventInput, type CalendarEvent } from "@/shared/models/calendar";

export const runtime = "nodejs";

function rowToEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    userEmail: row.user_email as string,
    categoryId: (row.category_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    startTime: new Date(row.start_time as string).toISOString(),
    endTime: new Date(row.end_time as string).toISOString(),
    allDay: Boolean(row.all_day),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function GET(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to query params are required (ISO)" }, { status: 400 });
  }
  if (isNaN(new Date(from).getTime()) || isNaN(new Date(to).getTime())) {
    return NextResponse.json({ error: "from/to must be valid ISO dates" }, { status: 400 });
  }

  // Overlap semantics: event overlaps [from, to] when start < to AND end > from.
  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_events
     WHERE user_email = $1
       AND start_time < $3
       AND end_time   > $2
     ORDER BY start_time ASC`,
    [userId, from, to],
  );
  return NextResponse.json(rows.map(rowToEvent));
}

export async function POST(req: Request) {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const v = validateEventInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const input = v.value;

  // Category ownership check (if provided).
  if (input.categoryId) {
    const owned = await queryInternalDatabase(
      `SELECT 1 FROM vybe_event_categories WHERE id = $1 AND user_email = $2`,
      [input.categoryId, userId],
    );
    if (owned.length === 0) {
      return NextResponse.json({ error: "categoryId not found" }, { status: 400 });
    }
  }

  const rows = await queryInternalDatabase(
    `INSERT INTO vybe_events (user_email, category_id, title, description, start_time, end_time, all_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      input.categoryId ?? null,
      input.title,
      input.description ?? null,
      input.startTime,
      input.endTime,
      input.allDay ?? false,
    ],
  );
  return NextResponse.json(rowToEvent(rows[0] as Record<string, unknown>));
}
