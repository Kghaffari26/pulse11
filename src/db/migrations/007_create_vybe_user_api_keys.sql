-- 007: BYOK storage for per-user API keys (Gemini).
-- Keys are encrypted with AES-256-GCM before insert using VYBE_ENCRYPTION_KEY.
-- We store the ciphertext, IV, and GCM auth tag (each base64) separately so
-- tampering is detectable on decrypt.

CREATE TABLE IF NOT EXISTS vybe_user_api_keys (
  user_email    TEXT        PRIMARY KEY,
  encrypted_key TEXT        NOT NULL,
  iv            TEXT        NOT NULL,
  auth_tag      TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
