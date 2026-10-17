import { describe, expect, test } from "vitest";
import { pendingVersions } from "@/lib/db/migration-plan";
import { parseLogin, parsePasswordPair, parseUsername } from "@/lib/auth/validate";

describe("account validation", () => {
  test("normalizes the master username and accepts the initial password", () => {
    const result = parseLogin("  Admin  ", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ username: "admin", password: "admin" });
  });

  test("rejects a short username", () => {
    const result = parseUsername("ab");
    expect(result.ok).toBe(false);
  });

  test("rejects a password longer than bcrypt can store", () => {
    const result = parsePasswordPair("a".repeat(73), "a".repeat(73));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("4 e 72");
  });

  test("rejects a confirmation that differs", () => {
    const result = parsePasswordPair("nova-senha", "outra-senha");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("As senhas não coincidem.");
  });
});

describe("pending migrations", () => {
  test("skips versions already recorded and keeps filename order", () => {
    expect(pendingVersions(["002_users.sql", "001_init.sql", "notes.txt"], new Set(["001_init"]))).toEqual([
      "002_users",
    ]);
  });
});
