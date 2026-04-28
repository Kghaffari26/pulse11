import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, maskApiKey } from "./crypto";

const key = randomBytes(32);

describe("encryptSecret / decryptSecret", () => {
  test("round-trips a plaintext key", () => {
    const original = "AIzaSyBkpF86y1-RZLtd7OeNXp0MDhV5lShoEnM";
    const blob = encryptSecret(original, key);
    expect(decryptSecret(blob, key)).toBe(original);
  });

  test("produces a fresh IV on every call (two encrypts of the same input differ)", () => {
    const a = encryptSecret("same-plaintext", key);
    const b = encryptSecret("same-plaintext", key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encryptedKey).not.toBe(b.encryptedKey);
    expect(decryptSecret(a, key)).toBe("same-plaintext");
    expect(decryptSecret(b, key)).toBe("same-plaintext");
  });

  test("rejects tampered ciphertext via the GCM auth tag", () => {
    const blob = encryptSecret("top-secret", key);
    const tampered = { ...blob, encryptedKey: Buffer.from("garbage").toString("base64") };
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  test("rejects tampered auth tag", () => {
    const blob = encryptSecret("top-secret", key);
    const tampered = { ...blob, authTag: Buffer.alloc(16).toString("base64") };
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  test("rejects decrypt with a wrong key", () => {
    const blob = encryptSecret("top-secret", key);
    const wrongKey = randomBytes(32);
    expect(() => decryptSecret(blob, wrongKey)).toThrow();
  });

  test("loadEncryptionKey surfaces a clear error when env is missing", () => {
    // Reach directly into a fresh encrypt with no key arg and no env var.
    const before = process.env.VYBE_ENCRYPTION_KEY;
    delete process.env.VYBE_ENCRYPTION_KEY;
    try {
      expect(() => encryptSecret("x")).toThrow(/VYBE_ENCRYPTION_KEY/);
    } finally {
      if (before !== undefined) process.env.VYBE_ENCRYPTION_KEY = before;
    }
  });

  test("loadEncryptionKey errors when key is the wrong length", () => {
    const before = process.env.VYBE_ENCRYPTION_KEY;
    process.env.VYBE_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    try {
      expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    } finally {
      if (before !== undefined) process.env.VYBE_ENCRYPTION_KEY = before;
      else delete process.env.VYBE_ENCRYPTION_KEY;
    }
  });
});

describe("maskApiKey", () => {
  test("masks a full-length key with 4/4 bookends", () => {
    expect(maskApiKey("AIzaSyBkpF86y1-RZLtd7OeNXp0MDhV5lShoEnM")).toBe("AIza...oEnM");
  });
  test("returns stars for very short input", () => {
    expect(maskApiKey("abc")).toBe("***");
  });
});
