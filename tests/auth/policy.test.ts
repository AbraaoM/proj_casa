import { describe, expect, test } from "vitest";
import { canManageAccounts, canResetPassword, firstRunMode, isPublicDeploy } from "@/lib/auth/policy";
import { parseNewPassword, parsePasswordPair } from "@/lib/auth/validate";

const master = { id: "m1", role: "admin" as const };
const member = { id: "p1", role: "member" as const };

describe("account policy", () => {
  test("only a master account manages accounts", () => {
    expect(canManageAccounts(master)).toBe(true);
    expect(canManageAccounts(member)).toBe(false);
    expect(canManageAccounts(null)).toBe(false);
  });

  test("a member never sets someone else's password; a master resets others, not itself", () => {
    expect(canResetPassword(member, "m1")).toBe(false);
    expect(canResetPassword(member, "p2")).toBe(false);
    expect(canResetPassword(master, "p1")).toBe(true);
    expect(canResetPassword(master, "m1")).toBe(false);
    expect(canResetPassword(null, "p1")).toBe(false);
  });

  test("the Vercel deploy is public: no first-account form there", () => {
    expect(isPublicDeploy({ VERCEL: "1" })).toBe(true);
    expect(isPublicDeploy({ CASA_PUBLIC: "1" })).toBe(true);
    expect(isPublicDeploy({})).toBe(false);
    expect(firstRunMode({ VERCEL: "1" })).toBe("seed_only");
    expect(firstRunMode({})).toBe("form");
  });
});

describe("new passwords", () => {
  test("need at least 8 characters", () => {
    expect(parseNewPassword("curta").ok).toBe(false);
    expect(parseNewPassword("admin").ok).toBe(false);
    expect(parseNewPassword("uma-senha-boa").ok).toBe(true);
  });

  test("the pair must match and follow the same rule", () => {
    expect(parsePasswordPair("uma-senha-boa", "outra-senha").ok).toBe(false);
    expect(parsePasswordPair("1234", "1234").ok).toBe(false);
    expect(parsePasswordPair("uma-senha-boa", "uma-senha-boa").ok).toBe(true);
  });
});
