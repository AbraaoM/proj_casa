import { describe, expect, test } from "vitest";
import type { DoseSchedule } from "@/lib/domain/doses";
import type { CareEvent, CareItem } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import type { DoseWrite } from "@/lib/repositories/doses";
import { medicationView, recordDose, refreshDoseSchedule, type DoseStore } from "@/lib/services/doses";

const ITEM = "22222222-2222-4222-8222-222222222222";
const CLOCK = { now: "2026-10-17T13:00:00.000Z", timeZone: "America/Sao_Paulo" };

function medicine(overrides: Partial<CareItem> = {}): CareItem {
  return {
    id: ITEM, domain: "family", dog_id: null, family_member_id: "bebe", vehicle_id: null, area_id: null,
    area_slug: null, subject_name: "Bebê", title: "Dipirona", category: "medicine", status: "active",
    priority: "normal", due_date: "2026-10-17", last_done_on: null, interval_days: null, interval_months: null,
    interval_hours: 6, last_done_at: null, next_due_at: null, ends_on: null, notes: null, created_by_agent: true,
    external_key: "family:bebe:dipirona", created_at: "", updated_at: "", ...overrides,
  };
}

function fakeStore(item: CareItem) {
  let current = item;
  const events: CareEvent[] = [];
  const store: DoseStore & { events: CareEvent[]; current: () => CareItem } = {
    events,
    current: () => current,
    async getItem(id) {
      return id === current.id ? current : null;
    },
    async findEventByExternalKey(key) {
      return events.find((event) => event.external_key === key) ?? null;
    },
    async findDoseAtMinute(itemId, doneAt) {
      return events.find((e) => e.care_item_id === itemId && !e.voided_at && e.done_at?.slice(0, 16) === doneAt.slice(0, 16)) ?? null;
    },
    async insertDose(write: DoseWrite) {
      const event: CareEvent = {
        id: `ev-${events.length + 1}`, care_item_id: write.item_id, domain: "family", dog_id: null,
        family_member_id: "bebe", vehicle_id: null, area_id: null, area_slug: null, subject_name: "Bebê",
        category: "medicine", title: current.title, done_on: write.done_on, done_at: write.done_at, notes: write.notes,
        provider: null, weight_kg: null, odometer_km: null, amount_cents: null, voided_at: null, created_by_agent: true,
        external_key: write.external_key, created_at: "", updated_at: "",
      };
      events.push(event);
      return event;
    },
    async liveDoseTimes() {
      return events.filter((e) => !e.voided_at && e.done_at).map((e) => e.done_at as string);
    },
    async writeDoseSchedule(_id, schedule: DoseSchedule) {
      current = { ...current, ...schedule };
    },
  };
  return store;
}

const dose = (given_at: string | null, external_key: string | null = null) => ({ given_at, notes: null, external_key });

describe("recordDose", () => {
  test("records the dose, keeps the item active and moves the next dose", async () => {
    const store = fakeStore(medicine());
    const result = await recordDose(store, ITEM, dose("2026-10-17T07:30"), CLOCK);
    expect(result.idempotentReplay).toBe(false);
    expect(result.event).toMatchObject({ done_at: "2026-10-17T10:30:00.000Z", done_on: "2026-10-17", care_item_id: ITEM });
    expect(result.item).toMatchObject({ status: "active", next_due_at: "2026-10-17T16:30:00.000Z", last_done_on: "2026-10-17" });
  });

  test("the same key or the same minute does not duplicate", async () => {
    const store = fakeStore(medicine());
    await recordDose(store, ITEM, dose("2026-10-17T07:30", "dose:dipirona:2026-10-17T07:30"), CLOCK);
    const byKey = await recordDose(store, ITEM, dose("2026-10-17T07:30", "dose:dipirona:2026-10-17T07:30"), CLOCK);
    const byMinute = await recordDose(store, ITEM, dose("2026-10-17T07:30:30"), CLOCK);
    expect(byKey.idempotentReplay).toBe(true);
    expect(byMinute.idempotentReplay).toBe(true);
    expect(store.events).toHaveLength(1);
  });

  test("a key used by another item is refused", async () => {
    const store = fakeStore(medicine());
    await recordDose(store, ITEM, dose("2026-10-17T07:30", "k"), CLOCK);
    store.events[0] = { ...(store.events[0] as CareEvent), care_item_id: "other" };
    await expect(recordDose(store, ITEM, dose("2026-10-17T07:20", "k"), CLOCK)).rejects.toThrow(AppError);
  });

  test("future doses and items without interval_hours are refused", async () => {
    await expect(recordDose(fakeStore(medicine()), ITEM, dose("2026-10-17T10:06"), CLOCK)).rejects.toThrow(/future/);
    await expect(recordDose(fakeStore(medicine()), ITEM, dose("2026-10-17T10:04"), CLOCK)).resolves.toBeTruthy();
    await expect(recordDose(fakeStore(medicine({ interval_hours: null })), ITEM, dose(null), CLOCK)).rejects.toThrow(/interval_hours/);
    await expect(recordDose(fakeStore(medicine()), "nope", dose(null), CLOCK)).rejects.toThrow(/not found/);
  });

  test("a dose whose next one falls after ends_on completes the treatment", async () => {
    const store = fakeStore(medicine({ interval_hours: 24, ends_on: "2026-10-17" }));
    const result = await recordDose(store, ITEM, dose("2026-10-17T01:30"), CLOCK);
    expect(result.item.status).toBe("completed");
    expect(result.item.next_due_at).toBeNull();
  });

  test("voiding the newest dose brings the schedule back", async () => {
    const store = fakeStore(medicine());
    await recordDose(store, ITEM, dose("2026-10-17T01:30"), CLOCK);
    await recordDose(store, ITEM, dose("2026-10-17T07:30"), CLOCK);
    store.events[1] = { ...(store.events[1] as CareEvent), voided_at: "2026-10-17T13:00:00.000Z" };
    const item = await refreshDoseSchedule(store, ITEM, CLOCK.timeZone);
    expect(item?.next_due_at).toBe("2026-10-17T10:30:00.000Z");
  });
});

describe("medicationView", () => {
  test("late, time and minutes left in the household zone", () => {
    const late = medicationView(medicine({ next_due_at: "2026-10-17T12:40:00.000Z" }), [], CLOCK);
    expect(late).toMatchObject({ late: true, next_due_time: "09:40", minutes_until_next: -20 });
    const soon = medicationView(medicine({ next_due_at: "2026-10-17T16:30:00.000Z" }), [], CLOCK);
    expect(soon).toMatchObject({ late: false, next_due_time: "13:30", next_due_day: "2026-10-17", minutes_until_next: 210 });
    expect(medicationView(medicine({ status: "completed", next_due_at: "2026-10-17T12:40:00.000Z" }), [], CLOCK).late).toBe(false);
  });
});
