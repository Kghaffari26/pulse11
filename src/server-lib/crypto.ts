import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: 32-byte key, 12-byte IV (recommended for GCM), 16-byte auth tag.
const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedBlob {
  encryptedKey: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function loadEncryptionKey(): Buffer {
  const raw = process.env.VYBE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "VYBE_ENCRYPTION_KEY is not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and add to .env.local",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `VYBE_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}). Expect a base64-encoded 32-byte key.`,
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext secret with AES-256-GCM using VYBE_ENCRYPTION_KEY.
 * Returns the ciphertext, IV, and GCM auth tag as three independent base64
 * strings so they can be stored in separate columns.
 */
export function encryptSecret(plaintext: string, key?: Buffer): EncryptedBlob {
  const k = key ?? loadEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, k, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedKey: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt an EncryptedBlob produced by encryptSecret. Throws if the auth tag
 * fails to verify (tampered ciphertext or wrong key).
 */
export function decryptSecret(blob: EncryptedBlob, key?: Buffer): string {
  const k = key ?? loadEncryptionKey();
  const iv = Buffer.from(blob.iv, "base64");
  const authTag = Buffer.from(blob.authTag, "base64");
  const ciphertext = Buffer.from(blob.encryptedKey, "base64");
  const decipher = createDecipheriv(ALGO, k, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** `AIza...XXXX` style preview for UI display. Never returns the raw key. */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return "***";
  return `${plaintext.slice(0, 4)}...${plaintext.slice(-4)}`;
}
