import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Secrets at rest (bot token, AI key, webhook secret): AES-256-GCM with one master key,
 * CASA_SECRET_KEY, 32 random bytes in base64. The database only ever holds ciphertext.
 * Format: "v1:" + base64(iv 12 bytes | auth tag 16 bytes | ciphertext).
 */
export const MASTER_KEY_ENV = "CASA_SECRET_KEY";
export const GENERATE_KEY_COMMAND = `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;

export type MasterKeyStatus = { ok: true; key: Buffer } | { ok: false; reason: "missing" | "invalid" };

export function readMasterKey(env: Record<string, string | undefined> = process.env): MasterKeyStatus {
  const raw = env[MASTER_KEY_ENV]?.trim();
  if (!raw) return { ok: false, reason: "missing" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return { ok: false, reason: "invalid" };
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) return { ok: false, reason: "invalid" };
  return { ok: true, key };
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** Throws when the key is wrong or the ciphertext was changed (GCM authentication). */
export function decryptSecret(stored: string, key: Buffer): string {
  if (!stored.startsWith("v1:")) throw new Error("Unknown secret format.");
  const raw = Buffer.from(stored.slice(3), "base64");
  if (raw.length < 29) throw new Error("Secret is truncated.");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** What the screen may show of a secret: its last 4 characters. */
export function lastFour(secret: string): string {
  return secret.slice(-4);
}

export function maskSecret(last4: string | null): string | null {
  if (!last4) return null;
  return `••••${last4}`;
}

/** A webhook secret Telegram accepts: 1-256 characters of A-Z, a-z, 0-9, _ and -. */
export function newWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}
