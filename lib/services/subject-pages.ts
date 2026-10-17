import { tryGetSql, type Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { isUuid, todayInTimeZone } from "@/lib/domain/dates";
import type { SubjectKind } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { listAreas } from "@/lib/repositories/areas";
import { listDogs, listFamily, listVehicles } from "@/lib/repositories/subjects";
import { getSubjectHistory, type AnySubjectHistory } from "@/lib/services/history";
import { readSettings } from "@/lib/services/settings";

export type PageLoad<T> =
  | { status: "unconfigured" | "schema_missing" | "error" | "not_found" }
  | { status: "ready"; today: string; data: T };

export type HistoryOf<K extends AnySubjectHistory["kind"]> = Extract<AnySubjectHistory, { kind: K }>;

/** Runs a page loader with the same failure states as the dashboard. Never throws. */
async function withDatabase<T>(load: (sql: Sql, today: string) => Promise<T | null>): Promise<PageLoad<T>> {
  const sql = tryGetSql();
  if (!sql) return { status: "unconfigured" };
  try {
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const data = await load(sql, today);
    if (data === null) return { status: "not_found" };
    return { status: "ready", today, data };
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return { status: "not_found" };
    if (isMissingSchema(error)) return { status: "schema_missing" };
    console.error(error);
    return { status: "error" };
  }
}

/** Every active subject of a kind with its history, for the list pages. */
export async function loadSubjectList<K extends SubjectKind>(kind: K): Promise<PageLoad<Array<HistoryOf<K>>>> {
  return withDatabase(async (sql, today) => {
    const ids = await listIds(sql, kind);
    const histories = await Promise.all(ids.map((id) => getSubjectHistory(sql, kind, id, today)));
    return histories as Array<HistoryOf<K>>;
  });
}

export async function loadSubjectDetail<K extends SubjectKind>(kind: K, ref: string): Promise<PageLoad<HistoryOf<K>>> {
  const validRef = isUuid(ref) || (kind === "area" && /^[a-z0-9_]{1,40}$/.test(ref));
  if (!validRef) return { status: "not_found" };
  return withDatabase(async (sql, today) => (await getSubjectHistory(sql, kind, ref, today)) as HistoryOf<K>);
}

async function listIds(sql: Sql, kind: SubjectKind): Promise<string[]> {
  if (kind === "dog") return (await listDogs(sql, false)).map((dog) => dog.id);
  if (kind === "vehicle") return (await listVehicles(sql, false)).map((vehicle) => vehicle.id);
  if (kind === "family") return (await listFamily(sql, false)).map((member) => member.id);
  return (await listAreas(sql, false)).map((area) => area.id);
}
