import { isUniqueViolation } from "@/lib/db/errors";
import type { CreateEventInput } from "@/lib/domain/events";
import { isNewestMeasurement } from "@/lib/domain/history";
import type { DoneInput } from "@/lib/domain/validate";
import type { CareEvent, CareItem, Domain, HouseArea } from "@/lib/domain/types";
import { validationError, type FieldError } from "@/lib/errors";
import type { EventWrite } from "@/lib/repositories/events";

export type SubjectRef = { domain: "dog" | "car" | "family"; id: string };

export type RecordEventStore = {
  findEventByExternalKey(key: string): Promise<CareEvent | null>;
  getItem(id: string): Promise<CareItem | null>;
  subjectExists(ref: SubjectRef): Promise<boolean>;
  getAreaByRef(ref: string): Promise<HouseArea | null>;
  insertEvent(write: EventWrite): Promise<CareEvent>;
  newestWeightDate(dogId: string, exceptEventId: string): Promise<string | null>;
  setDogWeight(dogId: string, weightKg: number): Promise<void>;
  bumpOdometer(vehicleId: string, km: number): Promise<void>;
  /** Same path as POST /items/:id/done. */
  markDone(
    itemId: string,
    input: DoneInput,
  ): Promise<{ item: CareItem; event: CareEvent; idempotentReplay: boolean }>;
};

export type RecordEventResult = {
  event: CareEvent;
  item: CareItem | null;
  idempotentReplay: boolean;
};

const SUBJECT_FIELD: Record<SubjectRef["domain"], "dog_id" | "vehicle_id" | "family_member_id"> = {
  dog: "dog_id",
  car: "vehicle_id",
  family: "family_member_id",
};

/**
 * Records something that was done. With care_item_id it marks that item done
 * (and reschedules it). Without it, the event stands alone in the subject's history.
 */
export async function recordEvent(
  store: RecordEventStore,
  input: CreateEventInput,
  today: string,
): Promise<RecordEventResult> {
  if (input.external_key) {
    const existing = await store.findEventByExternalKey(input.external_key);
    if (existing) {
      if ((input.care_item_id ?? null) !== (existing.care_item_id ?? null)) {
        throw keyTaken();
      }
      const item = existing.care_item_id ? await store.getItem(existing.care_item_id) : null;
      return { event: existing, item, idempotentReplay: true };
    }
  }

  if (input.care_item_id) return recordLinked(store, input);
  return recordStandalone(store, input, today);
}

async function recordLinked(store: RecordEventStore, input: CreateEventInput): Promise<RecordEventResult> {
  const itemId = input.care_item_id as string;
  const item = await store.getItem(itemId);
  if (!item) {
    throw validationError("care_item_id was not found.", [{ field: "care_item_id", message: "was not found" }]);
  }

  const details: FieldError[] = [];
  if (input.domain && input.domain !== item.domain) {
    details.push({ field: "domain", message: `does not match the item (${item.domain})` });
  }
  for (const field of ["dog_id", "vehicle_id", "family_member_id", "area_id"] as const) {
    const sent = input[field];
    if (sent && sent !== item[field]) details.push({ field, message: "does not match the item" });
  }
  if (input.area_slug && input.area_slug !== item.area_slug) {
    details.push({ field: "area", message: "does not match the item" });
  }
  if (details.length > 0) throw validationError(details[0]?.message ?? "Does not match the item.", details);

  const result = await store.markDone(itemId, {
    done_on: input.done_on,
    notes: input.notes,
    external_key: input.external_key,
    weight_kg: input.weight_kg,
    odometer_km: input.odometer_km,
    amount_cents: input.amount_cents,
    provider: input.provider,
  });
  return { event: result.event, item: result.item, idempotentReplay: result.idempotentReplay };
}

async function recordStandalone(
  store: RecordEventStore,
  input: CreateEventInput,
  today: string,
): Promise<RecordEventResult> {
  const domain = input.domain as Domain;
  const doneOn = input.done_on ?? today;
  if (doneOn > today) {
    throw validationError("done_on cannot be in the future.", [
      { field: "done_on", message: "cannot be in the future" },
    ]);
  }

  if (domain === "dog" || domain === "car" || domain === "family") {
    const field = SUBJECT_FIELD[domain];
    const id = input[field] as string;
    if (!(await store.subjectExists({ domain, id }))) {
      throw validationError(`${field} was not found.`, [{ field, message: "was not found" }]);
    }
  }

  let areaId: string | null = null;
  const areaRef = input.area_id ?? input.area_slug;
  if (domain === "house" && areaRef) {
    const area = await store.getAreaByRef(areaRef);
    const field = input.area_id ? "area_id" : "area";
    if (!area) throw validationError("area was not found.", [{ field, message: "was not found" }]);
    areaId = area.id;
  }

  const write: EventWrite = {
    care_item_id: null,
    domain,
    dog_id: input.dog_id,
    family_member_id: input.family_member_id,
    vehicle_id: input.vehicle_id,
    area_id: areaId,
    category: input.category as string,
    title: input.title as string,
    done_on: doneOn,
    notes: input.notes,
    provider: input.provider,
    weight_kg: input.weight_kg,
    odometer_km: input.odometer_km,
    amount_cents: input.amount_cents,
    external_key: input.external_key,
  };

  let event: CareEvent;
  try {
    event = await store.insertEvent(write);
  } catch (error) {
    if (input.external_key && isUniqueViolation(error)) {
      const existing = await store.findEventByExternalKey(input.external_key);
      if (existing && existing.care_item_id === null) {
        return { event: existing, item: null, idempotentReplay: true };
      }
      throw keyTaken();
    }
    throw error;
  }

  if (domain === "dog" && input.dog_id && input.weight_kg !== null) {
    const newest = await store.newestWeightDate(input.dog_id, event.id);
    if (isNewestMeasurement(doneOn, newest)) await store.setDogWeight(input.dog_id, input.weight_kg);
  }
  if (domain === "car" && input.vehicle_id && input.odometer_km !== null) {
    await store.bumpOdometer(input.vehicle_id, input.odometer_km);
  }

  return { event, item: null, idempotentReplay: false };
}

function keyTaken() {
  return validationError("external_key already belongs to another record.", [
    { field: "external_key", message: "already belongs to another record" },
  ]);
}
