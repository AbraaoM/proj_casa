import { describe, expect, test } from "vitest";
import type { CreateEventInput } from "@/lib/domain/events";
import type { CareEvent, CareItem, HouseArea } from "@/lib/domain/types";
import type { EventWrite } from "@/lib/repositories/events";
import { recordEvent, type RecordEventStore } from "@/lib/services/record-event";

const TODAY = "2026-10-16";
const DOG = "11111111-1111-4111-8111-111111111111";
const CAR = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const AREA = "44444444-4444-4444-8444-444444444444";

function input(overrides: Partial<CreateEventInput>): CreateEventInput {
  return {
    care_item_id: null,
    domain: "dog",
    dog_id: DOG,
    family_member_id: null,
    vehicle_id: null,
    area_id: null,
    area_slug: null,
    category: "vet",
    title: "Consulta",
    done_on: "2026-10-10",
    notes: null,
    provider: null,
    weight_kg: null,
    odometer_km: null,
    amount_cents: null,
    external_key: null,
    ...overrides,
  };
}

function eventFrom(write: EventWrite, id = "event-new"): CareEvent {
  return {
    id,
    ...write,
    area_slug: null,
    subject_name: null,
    voided_at: null,
    created_by_agent: true,
    created_at: "2026-10-16T12:00:00.000Z",
    updated_at: "2026-10-16T12:00:00.000Z",
  };
}

const item: CareItem = {
  id: ITEM,
  domain: "car",
  dog_id: null,
  family_member_id: null,
  vehicle_id: CAR,
  area_id: null,
  area_slug: null,
  subject_name: "Onix",
  title: "Troca de óleo",
  category: "oil",
  status: "active",
  priority: "normal",
  due_date: "2026-10-20",
  last_done_on: null,
  interval_days: 180,
  notes: null,
  created_by_agent: true,
  external_key: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const kitchen: HouseArea = {
  id: AREA,
  slug: "cozinha",
  name: "Cozinha",
  kind: "room",
  sort_order: 0,
  notes: null,
  archived_at: null,
  created_by_agent: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function memory(seed: { existing?: CareEvent | null; newestWeight?: string | null; subjects?: boolean } = {}) {
  const calls = {
    inserts: [] as EventWrite[],
    weights: [] as number[],
    odometers: [] as number[],
    markDone: [] as string[],
  };
  const store: RecordEventStore = {
    async findEventByExternalKey() {
      return seed.existing ?? null;
    },
    async getItem(id) {
      return id === ITEM ? item : null;
    },
    async subjectExists() {
      return seed.subjects ?? true;
    },
    async getAreaByRef(ref) {
      return ref === "cozinha" || ref === AREA ? kitchen : null;
    },
    async insertEvent(write) {
      calls.inserts.push(write);
      return eventFrom(write);
    },
    async newestWeightDate() {
      return seed.newestWeight ?? null;
    },
    async setDogWeight(_dog, kg) {
      calls.weights.push(kg);
    },
    async bumpOdometer(_vehicle, km) {
      calls.odometers.push(km);
    },
    async markDone(itemId, done) {
      calls.markDone.push(itemId);
      const write: EventWrite = {
        care_item_id: itemId,
        domain: "car",
        dog_id: null,
        family_member_id: null,
        vehicle_id: CAR,
        area_id: null,
        category: "oil",
        title: "Troca de óleo",
        done_on: done.done_on ?? TODAY,
        notes: done.notes,
        provider: done.provider,
        weight_kg: null,
        odometer_km: done.odometer_km,
        amount_cents: done.amount_cents,
        external_key: done.external_key,
      };
      return { item, event: eventFrom(write, "event-done"), idempotentReplay: false };
    },
  };
  return { store, calls };
}

describe("recordEvent", () => {
  test("writes a standalone event and updates the dog's weight when it is the newest", async () => {
    const { store, calls } = memory({ newestWeight: "2026-09-01" });
    const result = await recordEvent(store, input({ weight_kg: 12.3 }), TODAY);
    expect(result.idempotentReplay).toBe(false);
    expect(result.item).toBeNull();
    expect(calls.inserts[0]).toMatchObject({ care_item_id: null, domain: "dog", dog_id: DOG, done_on: "2026-10-10" });
    expect(calls.weights).toEqual([12.3]);
  });

  test("an older weight goes to history but does not replace the current weight", async () => {
    const { store, calls } = memory({ newestWeight: "2026-10-12" });
    await recordEvent(store, input({ weight_kg: 10 }), TODAY);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.weights).toEqual([]);
  });

  test("defaults done_on to today and refuses the future", async () => {
    const { store, calls } = memory();
    await recordEvent(store, input({ done_on: null }), TODAY);
    expect(calls.inserts[0]?.done_on).toBe(TODAY);
    await expect(recordEvent(store, input({ done_on: "2026-10-17" }), TODAY)).rejects.toMatchObject({
      code: "validation_error",
      details: [{ field: "done_on", message: "cannot be in the future" }],
    });
  });

  test("an unknown subject is a validation error", async () => {
    const { store, calls } = memory({ subjects: false });
    await expect(recordEvent(store, input({}), TODAY)).rejects.toMatchObject({
      details: [{ field: "dog_id", message: "was not found" }],
    });
    expect(calls.inserts).toHaveLength(0);
  });

  test("resolves a house area slug and rejects an unknown one", async () => {
    const { store, calls } = memory();
    await recordEvent(
      store,
      input({ domain: "house", dog_id: null, area_slug: "cozinha", category: "cleaning", title: "Limpeza" }),
      TODAY,
    );
    expect(calls.inserts[0]).toMatchObject({ domain: "house", area_id: AREA });
    await expect(
      recordEvent(store, input({ domain: "house", dog_id: null, area_slug: "porao", category: "cleaning", title: "x" }), TODAY),
    ).rejects.toMatchObject({ details: [{ field: "area", message: "was not found" }] });
  });

  test("bumps the odometer for car events", async () => {
    const { store, calls } = memory();
    await recordEvent(
      store,
      input({ domain: "car", dog_id: null, vehicle_id: CAR, category: "service", title: "Revisão", odometer_km: 45000 }),
      TODAY,
    );
    expect(calls.odometers).toEqual([45000]);
  });

  test("replays the same external_key without writing", async () => {
    const existing = eventFrom(input({}) as unknown as EventWrite, "event-old");
    const { store, calls } = memory({ existing });
    const result = await recordEvent(store, input({ external_key: "vet-1" }), TODAY);
    expect(result).toMatchObject({ idempotentReplay: true, event: { id: "event-old" } });
    expect(calls.inserts).toHaveLength(0);
  });

  test("an external_key from an item event cannot be reused standalone", async () => {
    const existing = { ...eventFrom(input({}) as unknown as EventWrite), care_item_id: ITEM };
    const { store } = memory({ existing });
    await expect(recordEvent(store, input({ external_key: "k" }), TODAY)).rejects.toMatchObject({
      details: [{ field: "external_key", message: "already belongs to another record" }],
    });
  });

  test("with care_item_id it marks the item done", async () => {
    const { store, calls } = memory();
    const result = await recordEvent(
      store,
      input({ care_item_id: ITEM, domain: null, dog_id: null, category: null, title: null, odometer_km: 45000 }),
      TODAY,
    );
    expect(calls.markDone).toEqual([ITEM]);
    expect(calls.inserts).toHaveLength(0);
    expect(result.item?.id).toBe(ITEM);
    expect(result.event.care_item_id).toBe(ITEM);
  });

  test("with care_item_id, a different domain or subject is rejected", async () => {
    const { store, calls } = memory();
    await expect(
      recordEvent(store, input({ care_item_id: ITEM, domain: "dog", dog_id: DOG, category: null, title: null }), TODAY),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      recordEvent(store, input({ care_item_id: "55555555-5555-4555-8555-555555555555", domain: null, dog_id: null }), TODAY),
    ).rejects.toMatchObject({ details: [{ field: "care_item_id", message: "was not found" }] });
    expect(calls.markDone).toHaveLength(0);
  });
});
