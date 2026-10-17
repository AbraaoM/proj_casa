import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  doseSchedule,
  FUTURE_TOLERANCE_MS,
  isDoseLate,
  localDay,
  localTime,
  minutesUntil,
  resolveGivenAt,
  type DoseInput,
  type DoseSchedule,
} from "@/lib/domain/doses";
import type { CareEvent, CareItem, Clock } from "@/lib/domain/types";
import { notFound, validationError } from "@/lib/errors";
import * as dosesRepo from "@/lib/repositories/doses";
import { findEventByExternalKey } from "@/lib/repositories/events";
import { getItem, listItems } from "@/lib/repositories/items";

export type DoseStore = {
  getItem(id: string): Promise<CareItem | null>;
  findEventByExternalKey(key: string): Promise<CareEvent | null>;
  findDoseAtMinute(itemId: string, doneAt: string): Promise<CareEvent | null>;
  insertDose(write: dosesRepo.DoseWrite): Promise<CareEvent>;
  liveDoseTimes(itemId: string): Promise<string[]>;
  writeDoseSchedule(itemId: string, schedule: DoseSchedule): Promise<void>;
};

export function sqlDoseStore(sql: Sql): DoseStore {
  return {
    getItem: (id) => getItem(sql, id),
    findEventByExternalKey: (key) => findEventByExternalKey(sql, key),
    findDoseAtMinute: (itemId, doneAt) => dosesRepo.findDoseAtMinute(sql, itemId, doneAt),
    insertDose: (write) => dosesRepo.insertDose(sql, write),
    liveDoseTimes: (itemId) => dosesRepo.liveDoseTimes(sql, itemId),
    writeDoseSchedule: (itemId, schedule) => dosesRepo.writeDoseSchedule(sql, itemId, schedule),
  };
}

export type DoseResult = { item: CareItem; event: CareEvent; idempotentReplay: boolean };

/**
 * Records one dose of an hourly item without completing it, then moves the
 * schedule to the newest live dose + interval_hours. Repeating the same dose
 * (same external_key, or same item and minute) returns the one already stored.
 */
export async function recordDose(store: DoseStore, itemId: string, input: DoseInput, clock: Clock): Promise<DoseResult> {
  if (input.external_key) {
    const existing = await store.findEventByExternalKey(input.external_key);
    if (existing) {
      if (existing.care_item_id !== itemId || existing.done_at === null) throw keyTaken();
      const item = await store.getItem(itemId);
      if (!item) throw notFound();
      return { item, event: existing, idempotentReplay: true };
    }
  }

  const item = await store.getItem(itemId);
  if (!item) throw notFound();
  if (!item.interval_hours) {
    throw validationError("This item has no interval_hours. PATCH /api/agent/items/:id with interval_hours first.", [
      { field: "interval_hours", message: "is not set on the item" },
    ]);
  }
  if (item.status === "cancelled") {
    throw validationError("The item is cancelled.", [{ field: "status", message: "is cancelled" }]);
  }

  const now = new Date(clock.now);
  const doneAt = resolveGivenAt(input.given_at, clock.timeZone, now);
  if (!doneAt) throw validationError("given_at is not a valid time.", [{ field: "given_at", message: "is not a valid time" }]);
  if (Date.parse(doneAt) > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw validationError("given_at cannot be in the future.", [{ field: "given_at", message: "cannot be in the future" }]);
  }

  const sameMinute = await store.findDoseAtMinute(itemId, doneAt);
  if (sameMinute) return { item, event: sameMinute, idempotentReplay: true };

  let event: CareEvent;
  try {
    event = await store.insertDose({
      item_id: itemId,
      done_at: doneAt,
      done_on: localDay(doneAt, clock.timeZone),
      notes: input.notes,
      external_key: input.external_key,
    });
  } catch (error) {
    if (input.external_key && isUniqueViolation(error)) {
      const existing = await store.findEventByExternalKey(input.external_key);
      if (existing?.care_item_id === itemId) return { item, event: existing, idempotentReplay: true };
      throw keyTaken();
    }
    throw error;
  }

  const updated = await refreshDoseSchedule(store, itemId, clock.timeZone);
  return { item: updated ?? item, event, idempotentReplay: false };
}

/** Recomputes an hourly item's schedule from its live doses (after a dose, a void or a PATCH). */
export async function refreshDoseSchedule(store: DoseStore, itemId: string, timeZone: string): Promise<CareItem | null> {
  const item = await store.getItem(itemId);
  if (!item) return null;
  if (!item.interval_hours) {
    if (item.next_due_at !== null) {
      await store.writeDoseSchedule(itemId, {
        last_done_at: item.last_done_at,
        last_done_on: item.last_done_on,
        next_due_at: null,
        due_date: item.due_date,
        status: item.status,
      });
      return store.getItem(itemId);
    }
    return item;
  }
  const schedule = doseSchedule(item, await store.liveDoseTimes(itemId), timeZone);
  await store.writeDoseSchedule(itemId, {
    ...schedule,
    last_done_on: schedule.last_done_on ?? item.last_done_on,
  });
  return store.getItem(itemId);
}

export type MedicationView = {
  item: CareItem;
  /** Live doses in the window, newest first. */
  doses: CareEvent[];
  next_due_at: string | null;
  /** "HH:mm" in the household time zone. */
  next_due_time: string | null;
  /** Day of the next dose in the household time zone. */
  next_due_day: string | null;
  minutes_until_next: number | null;
  late: boolean;
  /** Household time zone the times above are in. */
  timezone: string;
};

export function medicationView(item: CareItem, doses: CareEvent[], clock: Clock): MedicationView {
  const next = item.status === "active" ? item.next_due_at : null;
  return {
    item,
    doses,
    next_due_at: next,
    next_due_time: next ? localTime(next, clock.timeZone) : null,
    next_due_day: next ? localDay(next, clock.timeZone) : null,
    minutes_until_next: next ? minutesUntil(next, clock.now) : null,
    late: isDoseLate(next, clock.now),
    timezone: clock.timeZone,
  };
}

/** GET /api/agent/items/:id/doses */
export async function getItemDoses(
  sql: Sql,
  itemId: string,
  query: { from: string | null; to: string | null; include_voided: boolean; limit: number },
  clock: Clock,
): Promise<MedicationView> {
  const item = await getItem(sql, itemId);
  if (!item) throw notFound();
  const doses = await dosesRepo.listDoses(sql, { item_ids: [itemId], ...query });
  return medicationView(item, doses, clock);
}

export const MEDICATION_WINDOW_HOURS = 48;

/** Active hourly items of a family member with their doses of the last 48 hours. */
export async function listMedications(sql: Sql, familyMemberId: string, clock: Clock): Promise<MedicationView[]> {
  const items = (
    await listItems(sql, {
      domain: "family",
      status: "active",
      dog_id: null,
      family_member_id: familyMemberId,
      vehicle_id: null,
      area: null,
      limit: 200,
    })
  ).filter((item) => item.interval_hours !== null);
  if (items.length === 0) return [];
  const from = new Date(Date.parse(clock.now) - MEDICATION_WINDOW_HOURS * 3_600_000).toISOString();
  const doses = await dosesRepo.listDoses(sql, {
    item_ids: items.map((item) => item.id),
    from,
    to: null,
    include_voided: false,
    limit: 500,
  });
  return items
    .map((item) => medicationView(item, doses.filter((dose) => dose.care_item_id === item.id), clock))
    .sort((left, right) => {
      if (left.late !== right.late) return left.late ? -1 : 1;
      const l = left.next_due_at ? Date.parse(left.next_due_at) : Number.MAX_SAFE_INTEGER;
      const r = right.next_due_at ? Date.parse(right.next_due_at) : Number.MAX_SAFE_INTEGER;
      return l - r || left.item.title.localeCompare(right.item.title, "pt-BR");
    });
}

function keyTaken() {
  return validationError("external_key already belongs to another record.", [
    { field: "external_key", message: "already belongs to another record" },
  ]);
}
