import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import type { AreaInput, AreaPatch } from "@/lib/domain/areas";
import type { HouseArea } from "@/lib/domain/types";
import { notFound } from "@/lib/errors";
import * as areasRepo from "@/lib/repositories/areas";

export async function listAreas(sql: Sql, includeArchived: boolean): Promise<HouseArea[]> {
  return areasRepo.listAreas(sql, includeArchived);
}

export async function getArea(sql: Sql, ref: string): Promise<HouseArea> {
  const area = await areasRepo.getAreaByRef(sql, ref);
  if (!area) throw notFound("Area was not found.");
  return area;
}

/** The slug is the identity: creating an existing slug returns it untouched. */
export async function createArea(
  sql: Sql,
  input: AreaInput,
): Promise<{ area: HouseArea; idempotentReplay: boolean }> {
  const existing = await areasRepo.getAreaByRef(sql, input.slug);
  if (existing) return { area: existing, idempotentReplay: true };
  try {
    return { area: await areasRepo.insertArea(sql, input), idempotentReplay: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await areasRepo.getAreaByRef(sql, input.slug);
      if (raced) return { area: raced, idempotentReplay: true };
    }
    throw error;
  }
}

export async function updateArea(sql: Sql, ref: string, patch: AreaPatch): Promise<HouseArea> {
  const current = await getArea(sql, ref);
  const area = await areasRepo.updateArea(sql, current.id, patch);
  if (!area) throw notFound("Area was not found.");
  return area;
}
