import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import type { CreateItemInput, ItemListQuery } from "@/lib/domain/validate";
import { subjectErrors } from "@/lib/domain/validate";
import type { CareEvent, CareItem } from "@/lib/domain/types";
import { notFound, validationError } from "@/lib/errors";
import * as itemsRepo from "@/lib/repositories/items";
import { getDog, getFamilyMember, getVehicle } from "@/lib/repositories/subjects";

export async function listItems(sql: Sql, query: ItemListQuery): Promise<CareItem[]> {
  return itemsRepo.listItems(sql, query);
}

export async function getItemDetail(
  sql: Sql,
  id: string,
): Promise<{ item: CareItem; events: CareEvent[] }> {
  const item = await itemsRepo.getItem(sql, id);
  if (!item) throw notFound();
  const events = await itemsRepo.listEvents(sql, id);
  return { item, events };
}

export async function createItem(
  sql: Sql,
  input: CreateItemInput,
): Promise<{ item: CareItem; idempotentReplay: boolean }> {
  if (input.external_key) {
    const existing = await itemsRepo.findItemByExternalKey(sql, input.external_key);
    if (existing) return { item: existing, idempotentReplay: true };
  }

  await ensureSubject(sql, input);

  try {
    const item = await itemsRepo.insertItem(sql, input);
    return { item, idempotentReplay: false };
  } catch (error) {
    if (input.external_key && isUniqueViolation(error)) {
      const existing = await itemsRepo.findItemByExternalKey(sql, input.external_key);
      if (existing) return { item: existing, idempotentReplay: true };
    }
    throw error;
  }
}

export async function updateItem(
  sql: Sql,
  id: string,
  patch: Partial<CreateItemInput>,
): Promise<CareItem> {
  const current = await itemsRepo.getItem(sql, id);
  if (!current) throw notFound();

  const merged = {
    domain: patch.domain ?? current.domain,
    dog_id: patch.dog_id === undefined ? current.dog_id : patch.dog_id,
    family_member_id:
      patch.family_member_id === undefined ? current.family_member_id : patch.family_member_id,
    vehicle_id: patch.vehicle_id === undefined ? current.vehicle_id : patch.vehicle_id,
  };
  const details = subjectErrors(merged);
  if (details.length > 0) {
    throw validationError(details[0]?.message ?? "Invalid subject for this domain.", details);
  }

  const subjectChanged =
    merged.domain !== current.domain ||
    merged.dog_id !== current.dog_id ||
    merged.family_member_id !== current.family_member_id ||
    merged.vehicle_id !== current.vehicle_id;
  if (subjectChanged) await ensureSubject(sql, merged);

  const item = await itemsRepo.updateItem(sql, id, patch);
  if (!item) throw notFound();
  return item;
}

async function ensureSubject(
  sql: Sql,
  input: {
    domain: CreateItemInput["domain"];
    dog_id: string | null;
    family_member_id: string | null;
    vehicle_id: string | null;
  },
) {
  if (input.domain === "dog" && input.dog_id) {
    const dog = await getDog(sql, input.dog_id);
    if (!dog) {
      throw validationError("dog was not found.", [{ field: "dog_id", message: "was not found" }]);
    }
    if (dog.archived_at) {
      throw validationError("dog is archived.", [{ field: "dog_id", message: "is archived" }]);
    }
  }
  if (input.domain === "family" && input.family_member_id) {
    const member = await getFamilyMember(sql, input.family_member_id);
    if (!member) {
      throw validationError("family member was not found.", [
        { field: "family_member_id", message: "was not found" },
      ]);
    }
    if (member.archived_at) {
      throw validationError("family member is archived.", [
        { field: "family_member_id", message: "is archived" },
      ]);
    }
  }
  if (input.domain === "car" && input.vehicle_id) {
    const vehicle = await getVehicle(sql, input.vehicle_id);
    if (!vehicle) {
      throw validationError("vehicle was not found.", [{ field: "vehicle_id", message: "was not found" }]);
    }
    if (vehicle.archived_at) {
      throw validationError("vehicle is archived.", [{ field: "vehicle_id", message: "is archived" }]);
    }
  }
}
