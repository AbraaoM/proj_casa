import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret, lastFour, maskSecret, newWebhookSecret, readMasterKey } from "@/lib/secrets/crypto";

const key = randomBytes(32);

describe("secrets at rest", () => {
  test("roundtrip: what is encrypted comes back, and the ciphertext never holds the plain text", () => {
    const plain = "123456789:fake-token-for-tests-only-0000";
    const stored = encryptSecret(plain, key);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain(plain);
    expect(stored).not.toContain("fake-token");
    expect(decryptSecret(stored, key)).toBe(plain);
  });

  test("two encryptions of the same value differ (random IV)", () => {
    expect(encryptSecret("mesmo", key)).not.toBe(encryptSecret("mesmo", key));
  });

  test("a wrong key or a changed byte fails (GCM authentication)", () => {
    const stored = encryptSecret("segredo", key);
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
    const raw = Buffer.from(stored.slice(3), "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    expect(() => decryptSecret(`v1:${raw.toString("base64")}`, key)).toThrow();
    expect(() => decryptSecret("v0:abc", key)).toThrow();
    expect(() => decryptSecret("v1:AAAA", key)).toThrow();
  });

  test("master key: missing, invalid and valid", () => {
    expect(readMasterKey({})).toEqual({ ok: false, reason: "missing" });
    expect(readMasterKey({ CASA_SECRET_KEY: "  " })).toEqual({ ok: false, reason: "missing" });
    expect(readMasterKey({ CASA_SECRET_KEY: "curta" })).toEqual({ ok: false, reason: "invalid" });
    expect(readMasterKey({ CASA_SECRET_KEY: randomBytes(16).toString("base64") })).toEqual({ ok: false, reason: "invalid" });
    const valid = readMasterKey({ CASA_SECRET_KEY: key.toString("base64") });
    expect(valid.ok && valid.key.equals(key)).toBe(true);
  });

  test("masking shows only the last 4 characters", () => {
    const secret = "gsk_fake_key_for_tests_9f3a";
    expect(lastFour(secret)).toBe("9f3a");
    expect(maskSecret(lastFour(secret))).toBe("••••9f3a");
    expect(maskSecret(null)).toBeNull();
  });

  test("webhook secrets use only the characters Telegram accepts", () => {
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
    expect(newWebhookSecret()).not.toBe(secret);
  });
});
