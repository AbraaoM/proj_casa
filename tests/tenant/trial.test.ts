import { describe, expect, it } from "vitest";
import { isWriteStatement, trialState, TRIAL_DAYS } from "@/lib/tenant/scope";

const now = new Date("2026-11-21T12:00:00Z");

describe("trial state", () => {
  it("the original family never expires", () => {
    expect(trialState({ neverExpires: true, trialEndsAt: null }, now)).toEqual({ writable: true, expired: false, daysLeft: null, endsAt: null });
  });

  it("counts whole days left, rounding up, and blocks writes at the end", () => {
    const ends = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
    expect(trialState({ neverExpires: false, trialEndsAt: ends(TRIAL_DAYS) }, now)).toMatchObject({ writable: true, daysLeft: 14 });
    expect(trialState({ neverExpires: false, trialEndsAt: ends(0.2) }, now)).toMatchObject({ writable: true, daysLeft: 1 });
    expect(trialState({ neverExpires: false, trialEndsAt: ends(0) }, now)).toMatchObject({ writable: false, expired: true, daysLeft: 0 });
    expect(trialState({ neverExpires: false, trialEndsAt: ends(-3) }, now)).toMatchObject({ writable: false, expired: true });
  });

  it("flags statements that change data", () => {
    expect(isWriteStatement("SELECT 1")).toBe(false);
    expect(isWriteStatement("INSERT INTO dogs (name) VALUES ('x')")).toBe(true);
    expect(isWriteStatement("update dogs set name = 'y'")).toBe(true);
    expect(isWriteStatement("DELETE FROM dogs")).toBe(true);
  });
});
