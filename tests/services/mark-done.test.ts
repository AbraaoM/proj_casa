import { describe, expect, test } from "vitest";
import type { CareEvent, CareItem } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { markItemDone, type DoneWrite, type MarkDoneStore } from "@/lib/services/mark-done";

const TODAY = "2026-10-16";

function careItem(overrides: Partial<CareItem> = {}): CareItem {
  return {
    id: "item-1",
    domain: "dog",
    dog_id: "11111111-1111-4111-8111-111111111111",
    family_member_id: null,
    vehicle_id: null,
    area_id: null,
    area_slug: null,
    subject_name: "Luna",
    title: "Vacina V10",
    category: "vaccine",
    status: "active",
    priority: "normal",
    due_date: "2026-10-16",
    last_done_on: null,
    interval_days: 365,
    interval_months: null,
    interval_hours: null,
    last_done_at: null,
    next_due_at: null,
    ends_on: null,
    notes: null,
    created_by_agent: true,
    external_key: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function careEvent(overrides: Partial<CareEvent> = {}): CareEvent {
  return {
    id: "event-1",
    care_item_id: "item-1",
    domain: "dog",
    dog_id: "11111111-1111-4111-8111-111111111111",
    family_member_id: null,
    vehicle_id: null,
    area_id: null,
    area_slug: null,
    subject_name: "Luna",
    category: "vaccine",
    title: "Vacina V10",
    done_on: "2026-10-16",
    done_at: null,
    notes: null,
    provider: null,
    voided_at: null,
    updated_at: "2026-10-16T00:00:00.000Z",
    weight_kg: null,
    odometer_km: null,
    amount_cents: null,
    created_by_agent: true,
    external_key: "luna-v10",
    created_at: "2026-10-16T00:00:00.000Z",
    ...overrides,
  };
}

function store(seed: { item?: CareItem | null; event?: CareEvent | null } = {}): MarkDoneStore & {
  writes: DoneWrite[];
} {
  const writes: DoneWrite[] = [];
  return {
    writes,
    async getItem() {
      return seed.item === undefined ? careItem() : seed.item;
    },
    async findEventByExternalKey() {
      return seed.event ?? null;
    },
    async writeDone(write) {
      writes.push(write);
      return {
        item: careItem({
          last_done_on: write.last_done_on,
          due_date: write.due_date,
          status: write.status,
        }),
        event: careEvent({ done_on: write.done_on, external_key: write.external_key }),
      };
    },
  };
}

describe("markItemDone", () => {
  test("rejects an unknown item", async () => {
    await expect(
      markItemDone(store({ item: null }), "missing", { done_on: TODAY, notes: null, external_key: null, weight_kg: null, odometer_km: null, amount_cents: null, provider: null }, TODAY),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  test("returns the original event when external_key was already used", async () => {
    const memory = store({ event: careEvent() });
    const result = await markItemDone(
      memory,
      "item-1",
      { done_on: TODAY, notes: "de novo", external_key: "luna-v10", weight_kg: 12, odometer_km: null, amount_cents: null, provider: null },
      TODAY,
    );
    expect(result.idempotentReplay).toBe(true);
    expect(result.event.external_key).toBe("luna-v10");
    expect(memory.writes).toHaveLength(0);
  });

  test("refuses an external_key that belongs to another item", async () => {
    const memory = store({ event: careEvent({ care_item_id: "item-2" }) });
    await expect(
      markItemDone(
        memory,
        "item-1",
        { done_on: TODAY, notes: null, external_key: "luna-v10", weight_kg: null, odometer_km: null, amount_cents: null, provider: null },
        TODAY,
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(memory.writes).toHaveLength(0);
  });

  test("rejects a weight on a non-dog item and an odometer on a non-car item", async () => {
    const memory = store({ item: careItem({ domain: "house", dog_id: null }) });
    await expect(
      markItemDone(
        memory,
        "item-1",
        { done_on: TODAY, notes: null, external_key: null, weight_kg: 10, odometer_km: 1000, amount_cents: null, provider: null },
        TODAY,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(memory.writes).toHaveLength(0);
  });

  test("passes the provider through to the write", async () => {
    const memory = store();
    await markItemDone(
      memory,
      "item-1",
      { done_on: TODAY, notes: null, external_key: null, weight_kg: null, odometer_km: null, amount_cents: 12000, provider: "Clínica Pet" },
      TODAY,
    );
    expect(memory.writes[0]).toMatchObject({ provider: "Clínica Pet", amount_cents: 12000 });
  });

  test("rolls a recurring schedule forward from the done date", async () => {
    const memory = store();
    await markItemDone(
      memory,
      "item-1",
      { done_on: "2026-10-16", notes: null, external_key: null, weight_kg: 11.2, odometer_km: null, amount_cents: null, provider: null },
      TODAY,
    );
    expect(memory.writes[0]).toMatchObject({
      advance: true,
      due_date: "2027-10-16",
      status: "active",
      update_weight: true,
      update_odometer: false,
    });
  });

  test("keeps the current schedule when the logged day is older", async () => {
    const memory = store({
      item: careItem({ last_done_on: "2026-10-10", due_date: "2027-10-10", interval_days: 365 }),
    });
    await markItemDone(
      memory,
      "item-1",
      { done_on: "2026-09-01", notes: "registro antigo", external_key: null, weight_kg: 9, odometer_km: null, amount_cents: null, provider: null },
      TODAY,
    );
    expect(memory.writes[0]).toMatchObject({
      advance: false,
      done_on: "2026-09-01",
      last_done_on: "2026-10-10",
      due_date: "2027-10-10",
      // Still asked for: the repository only applies it if no newer weight exists.
      update_weight: true,
    });
  });
});
