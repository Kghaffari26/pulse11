import { NextResponse } from "next/server";
import { requireUserId } from "@/server-lib/auth";
import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { decryptSecret, encryptSecret, maskApiKey } from "@/server-lib/crypto";
import { validateGeminiApiKey } from "@/shared/models/ai";

export const runtime = "nodejs";

interface KeyRow {
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  updated_at: string;
}

export async function GET() {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const rows = await queryInternalDatabase(
    `SELECT encrypted_key, iv, auth_tag, updated_at
     FROM vybe_user_api_keys WHERE user_email = $1`,
    [userId],
  );
  if (rows.length === 0) {
    return NextResponse.json({ present: false });
  }
  const row = rows[0] as unknown as KeyRow;
  const decrypted = decryptSecret({
    encryptedKey: row.encrypted_key,
    iv: row.iv,
    authTag: row.auth_tag,
  });
  return NextResponse.json({
    present: true,
    mask: maskApiKey(decrypted),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
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

  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const v = validateGeminiApiKey(obj.apiKey);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const blob = encryptSecret(v.value);
  await queryInternalDatabase(
    `INSERT INTO vybe_user_api_keys (user_email, encrypted_key, iv, auth_tag)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_email) DO UPDATE SET
       encrypted_key = EXCLUDED.encrypted_key,
       iv            = EXCLUDED.iv,
       auth_tag      = EXCLUDED.auth_tag,
       updated_at    = NOW()`,
    [userId, blob.encryptedKey, blob.iv, blob.authTag],
  );

  return NextResponse.json({ ok: true, mask: maskApiKey(v.value) });
}

export async function DELETE() {
  const gate = await requireUserId();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  await queryInternalDatabase(
    `DELETE FROM vybe_user_api_keys WHERE user_email = $1`,
    [userId],
  );
  return NextResponse.json({ ok: true });
}
