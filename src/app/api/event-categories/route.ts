import { NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { seedDefaultCategoriesIfEmpty } from "@/server-lib/calendar-db";
import { validateCategoryInput, type EventCategory } from "@/shared/models/calendar";

export const runtime = "nodejs";

function rowToCategory(row: Record<string, unknown>): EventCategory {
  return {
    id: row.id as string,
    userEmail: row.user_email as string,
    name: row.name as string,
    color: row.color as string,
    isDefault: Boolean(row.is_default),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  await seedDefaultCategoriesIfEmpty(userId, {
    query: (text, params) => queryInternalDatabase(text, (params ?? []) as never[]),
    acquireClient: async () => {
      const c = await pool.connect();
      return {
        query: async (text: string, params?: unknown[]) => {
          const res = await c.query(text, params as unknown[]);
          return { rows: res.rows as Array<Record<string, unknown>> };
        },
        release: () => c.release(),
      };
    },
  });

  const rows = await queryInternalDatabase(
    `SELECT * FROM vybe_event_categories
     WHERE user_email = $1
     ORDER BY is_default DESC, created_at ASC`,
    [userId],
  );
  return NextResponse.json(rows.map(rowToCategory));
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

  const v = validateCategoryInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const rows = await queryInternalDatabase(
    `INSERT INTO vybe_event_categories (user_email, name, color, is_default)
     VALUES ($1, $2, $3, FALSE)
     RETURNING *`,
    [userId, v.value.name, v.value.color],
  );
  return NextResponse.json(rowToCategory(rows[0] as Record<string, unknown>));
}
