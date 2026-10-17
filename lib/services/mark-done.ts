import { applyDone } from "@/lib/domain/schedule";
import type { DoneInput } from "@/lib/domain/validate";
import type { CareEvent, CareItem, ItemStatus } from "@/lib/domain/types";
import { isUniqueViolation } from "@/lib/db/errors";
import { AppError, notFound, validationError } from "@/lib/errors";

export type DoneWrite = {
  item_id: string;
  done_on: string;
  notes: string | null;
  weight_kg: number | null;
  odometer_km: number | null;
  amount_cents: number | null;
  external_key: string | null;
  advance: boolean;
  last_done_on: string;
  due_date: string | null;
  status: ItemStatus;
  update_weight: boolean;
  update_odometer: boolean;
};

export type MarkDoneStore = {
  getItem(id: string): Promise<CareItem | null>;
  findEventByExternalKey(key: string): Promise<CareEvent | null>;
  writeDone(write: DoneWrite): Promise<{ item: CareItem; event: CareEvent }>;
};

export async function markItemDone(
  store: MarkDoneStore,
  id: string,
  input: DoneInput,
  today: string,
): Promise<{ item: CareItem; event: CareEvent; idempotentReplay: boolean }> {
  if (input.external_key) {
    const existing = await store.findEventByExternalKey(input.external_key);
    if (existing) {
      if (existing.care_item_id !== id) {
        throw validationError("external_key already belongs to another record.", [
          { field: "external_key", message: "already belongs to another record" },
        ]);
      }
      const item = await store.getItem(id);
      if (!item) throw notFound();
      return { item, event: existing, idempotentReplay: true };
    }
  }

  const current = await store.getItem(id);
  if (!current) throw notFound();

  const doneOn = input.done_on ?? today;
  const schedule = applyDone(current, doneOn);
  const write: DoneWrite = {
    item_id: id,
    done_on: doneOn,
    notes: input.notes,
    weight_kg: input.weight_kg,
    odometer_km: input.odometer_km,
    amount_cents: input.amount_cents,
    external_key: input.external_key,
    advance: schedule.advance,
    last_done_on: schedule.last_done_on,
    due_date: schedule.due_date,
    status: schedule.status,
    update_weight: schedule.advance && input.weight_kg !== null && current.domain === "dog",
    update_odometer: input.odometer_km !== null && current.domain === "car",
  };

  try {
    const written = await store.writeDone(write);
    return { ...written, idempotentReplay: false };
  } catch (error) {
    if (input.external_key && isUniqueViolation(error)) {
      const existing = await store.findEventByExternalKey(input.external_key);
      if (existing?.care_item_id === id) {
        const item = await store.getItem(id);
        if (item) return { item, event: existing, idempotentReplay: true };
      }
      throw validationError("external_key already belongs to another record.", [
        { field: "external_key", message: "already belongs to another record" },
      ]);
    }
    if (error instanceof AppError) throw error;
    throw error;
  }
}
