import type { Sql } from "@/lib/db/client";
import { measurementErrors, type CreateEventInput, type EventListQuery, type EventPatch } from "@/lib/domain/events";
import type { CareEvent } from "@/lib/domain/types";
import { notFound, validationError } from "@/lib/errors";
import { getAreaByRef } from "@/lib/repositories/areas";
import * as eventsRepo from "@/lib/repositories/events";
import { findEventByExternalKey, getItem, writeDone } from "@/lib/repositories/items";
import { getDog, getFamilyMember, getVehicle } from "@/lib/repositories/subjects";
import { markItemDone } from "@/lib/services/mark-done";
import { recordEvent, type RecordEventResult, type RecordEventStore } from "@/lib/services/record-event";

export function sqlEventStore(sql: Sql, today: string): RecordEventStore {
  return {
    findEventByExternalKey: (key) => eventsRepo.findEventByExternalKey(sql, key),
    getItem: (id) => getItem(sql, id),
    async subjectExists(ref) {
      if (ref.domain === "dog") return (await getDog(sql, ref.id)) !== null;
      if (ref.domain === "car") return (await getVehicle(sql, ref.id)) !== null;
      return (await getFamilyMember(sql, ref.id)) !== null;
    },
    getAreaByRef: (ref) => getAreaByRef(sql, ref),
    insertEvent: (write) => eventsRepo.insertEvent(sql, write),
    newestWeightDate: (dogId, except) => eventsRepo.newestWeightDate(sql, dogId, except),
    setDogWeight: (dogId, kg) => eventsRepo.setDogWeight(sql, dogId, kg),
    bumpOdometer: (vehicleId, km) => eventsRepo.bumpOdometer(sql, vehicleId, km),
    markDone: (itemId, input) =>
      markItemDone(
        {
          getItem: (id) => getItem(sql, id),
          findEventByExternalKey: (key) => findEventByExternalKey(sql, key),
          writeDone: (write) => writeDone(sql, write),
        },
        itemId,
        input,
        today,
      ),
  };
}

export async function createEvent(sql: Sql, input: CreateEventInput, today: string): Promise<RecordEventResult> {
  return recordEvent(sqlEventStore(sql, today), input, today);
}

export async function listEvents(sql: Sql, query: EventListQuery): Promise<CareEvent[]> {
  return eventsRepo.listEvents(sql, query);
}

export async function getEvent(sql: Sql, id: string): Promise<CareEvent> {
  const event = await eventsRepo.getEvent(sql, id);
  if (!event) throw notFound("Event was not found.");
  return event;
}

/**
 * Corrects an event. Voiding hides it from history and summaries without deleting it.
 * A dog's weight follows its newest live weight event afterwards. The item's schedule
 * is not moved back: use PATCH /items/:id for that.
 */
export async function updateEvent(
  sql: Sql,
  id: string,
  patch: EventPatch,
  today: string,
): Promise<{ event: CareEvent; notes: string[] }> {
  const current = await getEvent(sql, id);
  const details = measurementErrors(current.domain, patch.weight_kg ?? null, patch.odometer_km ?? null);
  if (patch.done_on && patch.done_on > today) {
    details.push({ field: "done_on", message: "cannot be in the future" });
  }
  if (details.length > 0) throw validationError(details[0]?.message ?? "Invalid event.", details);

  const event = await eventsRepo.updateEvent(sql, id, patch);
  if (!event) throw notFound("Event was not found.");

  const touchesWeight =
    patch.weight_kg !== undefined || patch.done_on !== undefined || patch.voided !== undefined;
  if (event.domain === "dog" && event.dog_id && touchesWeight && (current.weight_kg !== null || event.weight_kg !== null)) {
    await eventsRepo.refreshDogWeight(sql, event.dog_id);
  }
  if (event.domain === "car" && event.vehicle_id && event.voided_at === null && event.odometer_km !== null) {
    await eventsRepo.bumpOdometer(sql, event.vehicle_id, event.odometer_km);
  }

  const notes: string[] = [];
  if (event.care_item_id && (patch.voided !== undefined || patch.done_on !== undefined)) {
    notes.push("The linked item's schedule was not changed. PATCH /api/agent/items/:id to adjust due_date.");
  }
  return { event, notes };
}
