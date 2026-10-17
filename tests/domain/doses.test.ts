import { describe, expect, test } from "vitest";
import { attentionPhrase, attentionState, sortAttention } from "@/lib/domain/attention";
import { doseSchedule, isDoseLate, localDay, localTime, parseDoseBody, resolveGivenAt } from "@/lib/domain/doses";
import { parseCreateItem, parseItemPatch } from "@/lib/domain/validate";

const TZ = "America/Sao_Paulo";
const NOW = new Date("2026-10-17T13:00:00.000Z"); // 10:00 in São Paulo

describe("resolveGivenAt", () => {
  test("a local time is read in the household time zone", () => {
    expect(resolveGivenAt("2026-10-17T07:30", TZ, NOW)).toBe("2026-10-17T10:30:00.000Z");
    expect(resolveGivenAt("2026-10-17 01:30:00", TZ, NOW)).toBe("2026-10-17T04:30:00.000Z");
  });
  test("an explicit offset or Z wins", () => {
    expect(resolveGivenAt("2026-10-17T07:30:00-03:00", TZ, NOW)).toBe("2026-10-17T10:30:00.000Z");
    expect(resolveGivenAt("2026-10-17T10:30:00Z", TZ, NOW)).toBe("2026-10-17T10:30:00.000Z");
    expect(resolveGivenAt("2026-10-17T07:30:00-0300", TZ, NOW)).toBe("2026-10-17T10:30:00.000Z");
  });
  test("no time means now, to the minute", () => {
    expect(resolveGivenAt(null, TZ, new Date("2026-10-17T13:00:42.500Z"))).toBe("2026-10-17T13:00:00.000Z");
  });
  test("an impossible time is rejected", () => {
    expect(resolveGivenAt("2026-02-30T07:30", TZ, NOW)).toBeNull();
    expect(resolveGivenAt("2026-10-17T24:20", TZ, NOW)).toBeNull();
  });
});

describe("local day and time", () => {
  test("late evening in São Paulo is still the same day", () => {
    expect(localDay("2026-10-18T02:30:00.000Z", TZ)).toBe("2026-10-17");
    expect(localTime("2026-10-18T02:30:00.000Z", TZ)).toBe("23:30");
    expect(localDay("2026-10-18T04:30:00.000Z", TZ)).toBe("2026-10-18");
  });
});

describe("parseDoseBody", () => {
  test("accepts the known fields", () => {
    const parsed = parseDoseBody({ given_at: "2026-10-17T07:30", notes: " 5 ml ", external_key: "dose:x" });
    expect(parsed).toEqual({ ok: true, value: { given_at: "2026-10-17T07:30", notes: "5 ml", external_key: "dose:x" } });
  });
  test("rejects unknown fields and bad times", () => {
    const parsed = parseDoseBody({ given_at: "07:30", done: true });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.details.map((d) => d.field).sort()).toEqual(["done", "given_at"]);
  });
});

describe("doseSchedule", () => {
  const item = { interval_hours: 6, ends_on: null, status: "active" as const, due_date: "2026-10-17" };

  test("next dose = newest live dose + interval", () => {
    const schedule = doseSchedule(item, ["2026-10-17T04:30:00.000Z", "2026-10-17T10:30:00.000Z"], TZ);
    expect(schedule).toEqual({
      last_done_at: "2026-10-17T10:30:00.000Z",
      last_done_on: "2026-10-17",
      next_due_at: "2026-10-17T16:30:00.000Z",
      due_date: "2026-10-17",
      status: "active",
    });
  });
  test("an older dose recorded late does not move the schedule", () => {
    const before = doseSchedule(item, ["2026-10-17T10:30:00.000Z"], TZ);
    const after = doseSchedule(item, ["2026-10-17T10:30:00.000Z", "2026-10-17T04:30:00.000Z"], TZ);
    expect(after).toEqual(before);
  });
  test("the next dose after midnight falls on the next day", () => {
    const schedule = doseSchedule({ ...item, interval_hours: 8 }, ["2026-10-17T20:00:00.000Z"], TZ); // 17:00 local
    expect(schedule.next_due_at).toBe("2026-10-18T04:00:00.000Z"); // 01:00 local
    expect(schedule.due_date).toBe("2026-10-18");
  });
  test("with no live doses the item keeps its day and has no next time", () => {
    expect(doseSchedule(item, [], TZ)).toEqual({
      last_done_at: null,
      last_done_on: null,
      next_due_at: null,
      due_date: "2026-10-17",
      status: "active",
    });
  });
  test("past ends_on the treatment is over and the item completes", () => {
    const ending = { ...item, interval_hours: 24, ends_on: "2026-10-17" };
    const schedule = doseSchedule(ending, ["2026-10-17T04:30:00.000Z"], TZ);
    expect(schedule.status).toBe("completed");
    expect(schedule.next_due_at).toBeNull();
    const stillOn = doseSchedule({ ...ending, ends_on: "2026-10-18" }, ["2026-10-17T04:30:00.000Z"], TZ);
    expect(stillOn.status).toBe("active");
    expect(stillOn.next_due_at).toBe("2026-10-18T04:30:00.000Z");
  });
  test("a paused item is not completed by ends_on", () => {
    const schedule = doseSchedule({ ...item, status: "paused", ends_on: "2026-10-16" }, ["2026-10-17T04:30:00.000Z"], TZ);
    expect(schedule.status).toBe("paused");
  });
});

describe("hourly attention", () => {
  const clock = { now: NOW.toISOString(), timeZone: TZ };
  const base = { status: "active" as const, due_date: "2026-10-17", priority: "normal" as const };

  test("late as soon as the time passes, no tolerance", () => {
    expect(isDoseLate("2026-10-17T12:59:00.000Z", clock.now)).toBe(true);
    expect(isDoseLate("2026-10-17T13:00:00.000Z", clock.now)).toBe(false);
    expect(attentionState({ ...base, next_due_at: "2026-10-17T12:59:00.000Z" }, "2026-10-17", 14, clock)).toBe("overdue");
    expect(attentionState({ ...base, next_due_at: "2026-10-17T15:00:00.000Z" }, "2026-10-17", 14, clock)).toBe("due_today");
  });
  test("without a clock the day rules stay as before", () => {
    expect(attentionState({ ...base, next_due_at: "2026-10-17T12:59:00.000Z" }, "2026-10-17")).toBe("due_today");
  });
  test("doses of the same day are sorted by time and carry HH:mm", () => {
    const sorted = sortAttention(
      [
        { ...base, id: "amox", next_due_at: "2026-10-17T20:15:00.000Z" },
        { ...base, id: "dip", next_due_at: "2026-10-17T16:30:00.000Z" },
      ],
      "2026-10-17",
      14,
      clock,
    );
    expect(sorted.map((item) => [item.id, item.next_due_time])).toEqual([
      ["dip", "13:30"],
      ["amox", "17:15"],
    ]);
  });
  test("phrases name the time", () => {
    expect(attentionPhrase("overdue", 0, "13:30")).toBe("dose atrasada · era 13:30");
    expect(attentionPhrase("due_today", 0, "13:30")).toBe("próxima dose 13:30");
    expect(attentionPhrase("upcoming", 1, "07:30")).toBe("próxima dose amanhã 07:30");
    expect(attentionPhrase("due_today", 0)).toBe("vence hoje");
  });
});

describe("item validation", () => {
  test("interval_hours and ends_on on create", () => {
    const parsed = parseCreateItem({
      domain: "family",
      family_member_id: "11111111-1111-4111-8111-111111111111",
      title: "Dipirona",
      category: "medicine",
      interval_hours: 6,
      ends_on: "2026-10-20",
    });
    expect(parsed.ok && [parsed.value.interval_hours, parsed.value.ends_on]).toEqual([6, "2026-10-20"]);
  });
  test("only one schedule at a time", () => {
    const parsed = parseCreateItem({ domain: "house", title: "x", category: "other", interval_days: 1, interval_hours: 6 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.details[0]?.field).toBe("interval_hours");
    expect(parseItemPatch({ interval_hours: 8 })).toEqual({
      ok: true,
      value: { interval_hours: 8, interval_days: null, interval_months: null },
    });
  });
  test("interval_hours is 1 to 168", () => {
    expect(parseItemPatch({ interval_hours: 0 }).ok).toBe(false);
    expect(parseItemPatch({ interval_hours: 169 }).ok).toBe(false);
  });
});
