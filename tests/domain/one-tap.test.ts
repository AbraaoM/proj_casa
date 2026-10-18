import { describe, expect, it } from "vitest";
import { actionsFor, decodeUndo, encodeUndo, parseDoneKey, payLabel, shiftTarget, tapKey } from "@/lib/domain/one-tap";

const ID = "7becaf34-23c1-43d0-b39e-575b015850df";
const base = { status: "active" as const, due_date: "2026-10-17", interval_days: null, interval_months: null, interval_hours: null };

describe("one-tap actions", () => {
  it("gives a bill only Paguei, with the expected amount when it varies", () => {
    const bill = { id: ID, kind: "bill", amount_cents: 21000, amount_varies: true, next_due_date: "2026-10-17" };
    expect(actionsFor(base, bill).map((action) => action.label)).toEqual(["Paguei ~210"]);
    expect(payLabel({ amount_cents: 4990, amount_varies: false })).toBe("Paguei");
    expect(actionsFor(base, { ...bill, kind: "income" })).toEqual([]);
  });

  it("gives a medicine Dose dada and other items Feito, +1 dia and, when recurring, Ignorar", () => {
    expect(actionsFor({ ...base, interval_hours: 8 }, null).map((action) => action.kind)).toEqual(["dose"]);
    expect(actionsFor(base, null).map((action) => action.kind)).toEqual(["snooze", "done"]);
    expect(actionsFor({ ...base, interval_days: 30 }, null).map((action) => action.kind)).toEqual(["snooze", "skip", "done"]);
    expect(actionsFor({ ...base, status: "paused" }, null)).toEqual([]);
  });

  it("moves +1 day or to the next cycle", () => {
    expect(shiftTarget({ interval_days: null, interval_months: null }, "snooze", "2026-10-31")).toBe("2026-11-01");
    expect(shiftTarget({ interval_days: 90, interval_months: null }, "skip", "2026-10-15")).toBe("2027-01-13");
    expect(shiftTarget({ interval_days: null, interval_months: 1 }, "skip", "2026-01-31")).toBe("2026-02-28");
    expect(shiftTarget({ interval_days: null, interval_months: null }, "skip", "2026-10-15")).toBeNull();
  });

  it("keeps the due date in the done key and round-trips undo tokens", () => {
    expect(parseDoneKey(tapKey("done", ID, "2026-10-15"))).toEqual({ itemId: ID, due: "2026-10-15" });
    expect(parseDoneKey(tapKey("done", ID, null))).toEqual({ itemId: ID, due: null });
    expect(parseDoneKey("agent:x")).toBeNull();
    for (const token of [{ kind: "event", id: ID } as const, { kind: "shift", id: ID, from: "2026-10-17", to: "2026-10-18" } as const]) {
      expect(decodeUndo(encodeUndo(token))).toEqual(token);
    }
    expect(decodeUndo("event:nope")).toBeNull();
    expect(decodeUndo(42)).toBeNull();
  });
});
