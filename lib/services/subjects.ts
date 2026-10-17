import type { Sql } from "@/lib/db/client";
import type {
  DogInput,
  DogPatch,
  FamilyInput,
  FamilyPatch,
  VehicleInput,
  VehiclePatch,
} from "@/lib/domain/entities";
import type { Dog, FamilyMember, Vehicle } from "@/lib/domain/types";
import { notFound } from "@/lib/errors";
import * as subjects from "@/lib/repositories/subjects";

export async function listDogs(sql: Sql, includeArchived: boolean): Promise<Dog[]> {
  return subjects.listDogs(sql, includeArchived);
}

export async function createDog(sql: Sql, input: DogInput): Promise<Dog> {
  return subjects.insertDog(sql, input);
}

export async function updateDog(sql: Sql, id: string, patch: DogPatch): Promise<Dog> {
  const dog = await subjects.updateDog(sql, id, patch);
  if (!dog) throw notFound("Dog was not found.");
  return dog;
}

export async function listFamily(sql: Sql, includeArchived: boolean): Promise<FamilyMember[]> {
  return subjects.listFamily(sql, includeArchived);
}

export async function createFamily(sql: Sql, input: FamilyInput): Promise<FamilyMember> {
  return subjects.insertFamily(sql, input);
}

export async function updateFamily(sql: Sql, id: string, patch: FamilyPatch): Promise<FamilyMember> {
  const member = await subjects.updateFamily(sql, id, patch);
  if (!member) throw notFound("Family member was not found.");
  return member;
}

export async function listVehicles(sql: Sql, includeArchived: boolean): Promise<Vehicle[]> {
  return subjects.listVehicles(sql, includeArchived);
}

export async function createVehicle(sql: Sql, input: VehicleInput): Promise<Vehicle> {
  return subjects.insertVehicle(sql, input);
}

export async function updateVehicle(sql: Sql, id: string, patch: VehiclePatch): Promise<Vehicle> {
  const vehicle = await subjects.updateVehicle(sql, id, patch);
  if (!vehicle) throw notFound("Vehicle was not found.");
  return vehicle;
}
