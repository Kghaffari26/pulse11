import { queryInternalDatabase } from "@/server-lib/internal-db-query";
import { decryptSecret } from "@/server-lib/crypto";

/**
 * Load and decrypt the user's stored Gemini API key, or null if they have
 * not added one. The decrypted key is only returned to server-side callers;
 * it is never surfaced in an HTTP response.
 */
export async function loadUserApiKey(userId: string): Promise<string | null> {
  const rows = await queryInternalDatabase(
    `SELECT encrypted_key, iv, auth_tag
     FROM vybe_user_api_keys WHERE user_email = $1`,
    [userId],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return decryptSecret({
    encryptedKey: row.encrypted_key as string,
    iv: row.iv as string,
    authTag: row.auth_tag as string,
  });
}
