import { tryGetSql, type Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { isUuid, todayInTimeZone } from "@/lib/domain/dates";
import { summarizeHistory, type HistorySummary } from "@/lib/domain/history";
import type { AreaKind, AttentionItem, CareEvent, HouseholdSettings, SubjectKind } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { listAreas } from "@/lib/repositories/areas";
import { listEvents } from "@/lib/repositories/events";
import { listItems } from "@/lib/repositories/items";
import { listDogs, listFamily, listVehicles } from "@/lib/repositories/subjects";
import { getSubjectHistory, sortActive, type AnySubjectHistory } from "@/lib/services/history";
import { fetchWeather } from "@/lib/weather/open-meteo";
import { cache } from "react";
import { clockFor, readSettings } from "@/lib/services/settings";
import { listRoutines, loadSheet, type RoutineView } from "@/lib/services/routines";
import type { Sheet } from "@/lib/domain/routine";

/** Days of the folha de registro on an area page (the phone shows the newest 7, scrolls to the rest). */
export const SHEET_DAYS = 30;

export type PageLoad<T> =
  | { status: "unconfigured" | "schema_missing" | "error" | "not_found" }
  | { status: "ready"; today: string; data: T };

export type HistoryOf<K extends AnySubjectHistory["kind"]> = Extract<AnySubjectHistory, { kind: K }>;

/**
 * The household settings once per request. The app layout starts this next to the
 * session lookup, so pages find it ready instead of waiting one more round trip.
 */
export const requestSettings = cache(async (): Promise<HouseholdSettings | null> => {
  const sql = tryGetSql();
  return sql ? readSettings(sql) : null;
});

/** Runs a page loader with the same failure states as the dashboard. Never throws. */
export async function withDatabase<T>(
  load: (sql: Sql, today: string, settings: HouseholdSettings) => Promise<T | null>,
): Promise<PageLoad<T>> {
  const sql = tryGetSql();
  if (!sql) return { status: "unconfigured" };
  try {
    const settings = (await requestSettings()) ?? (await readSettings(sql));
    const today = todayInTimeZone(settings.timezone);
    const data = await load(sql, today, settings);
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
  return withDatabase(async (sql, today, settings) => {
    const ids = await listIds(sql, kind);
    const clock = clockFor(settings);
    const histories = await Promise.all(ids.map((id) => getSubjectHistory(sql, kind, id, today, clock)));
    return histories as Array<HistoryOf<K>>;
  });
}

export async function loadSubjectDetail<K extends SubjectKind>(kind: K, ref: string): Promise<PageLoad<HistoryOf<K>>> {
  const validRef = isUuid(ref) || (kind === "area" && /^[a-z0-9_]{1,40}$/.test(ref));
  if (!validRef) return { status: "not_found" };
  return withDatabase(
    async (sql, today, settings) => (await getSubjectHistory(sql, kind, ref, today, clockFor(settings))) as HistoryOf<K>,
  );
}

async function listIds(sql: Sql, kind: SubjectKind): Promise<string[]> {
  if (kind === "dog") return (await listDogs(sql, false)).map((dog) => dog.id);
  if (kind === "vehicle") return (await listVehicles(sql, false)).map((vehicle) => vehicle.id);
  if (kind === "family") return (await listFamily(sql, false)).map((member) => member.id);
  return (await listAreas(sql, false)).map((area) => area.id);
}

/** House items and events that have no area: "Casa · geral". */
export type HouseGeneral = { active_items: AttentionItem[]; events: CareEvent[]; summary: HistorySummary };

export type HouseOverview = {
  groups: Array<{ kind: AreaKind; areas: Array<HistoryOf<"area">> }>;
  general: HouseGeneral;
  outdoor_delay: boolean;
  /** Every house routine, most urgent first (the checklist). */
  routines: RoutineView[];
};

/** An area page: its history, its routines with the folha de registro, and the rain hint. */
export type AreaDetail = HistoryOf<"area"> & { outdoor_delay: boolean; routines: RoutineView[]; sheet: Sheet };

const KIND_ORDER: AreaKind[] = ["room", "outdoor", "system"];

export async function loadHouseOverview(): Promise<PageLoad<HouseOverview>> {
  return withDatabase(async (sql, today, settings) => {
    const areas = await listAreas(sql, false);
    const [histories, general, weather, routines] = await Promise.all([
      Promise.all(areas.map((area) => getSubjectHistory(sql, "area", area.id, today) as Promise<HistoryOf<"area">>)),
      houseGeneral(sql, today),
      fetchWeather(settings),
      listRoutines(sql, { area: null, status: null, limit: null, today, timeZone: settings.timezone }),
    ]);
    const groups = KIND_ORDER.map((kind) => ({
      kind,
      areas: histories.filter((history) => history.subject.kind === kind),
    })).filter((group) => group.areas.length > 0);
    return { groups, general, outdoor_delay: Boolean(weather?.outdoor_delay), routines };
  });
}

export async function loadHouseGeneral(): Promise<PageLoad<HouseGeneral>> {
  return withDatabase((sql, today) => houseGeneral(sql, today));
}

/** An area page plus whether rain should hold outdoor work today. */
export async function loadAreaDetail(ref: string): Promise<PageLoad<AreaDetail>> {
  if (!/^[a-z0-9_]{1,40}$/.test(ref) && !isUuid(ref)) return { status: "not_found" };
  return withDatabase(async (sql, today, settings) => {
    const history = (await getSubjectHistory(sql, "area", ref, today)) as HistoryOf<"area">;
    const [weather, routines] = await Promise.all([
      history.subject.kind === "outdoor" ? fetchWeather(settings) : Promise.resolve(null),
      listRoutines(sql, { area: history.subject.id, status: null, limit: null, today, timeZone: settings.timezone }),
    ]);
    const sheet = await loadSheet(sql, { routines, today, days: SHEET_DAYS, timeZone: settings.timezone });
    const ids = new Set(routines.map((routine) => routine.id));
    return {
      ...history,
      // Routines live in the checklist; "Próximos" keeps the one-off tasks.
      active_items: history.active_items.filter((item) => !ids.has(item.id)),
      outdoor_delay: Boolean(weather?.outdoor_delay),
      routines,
      sheet,
    };
  });
}

async function houseGeneral(sql: Sql, today: string): Promise<HouseGeneral> {
  const [items, events] = await Promise.all([
    listItems(sql, {
      domain: "house",
      status: "active",
      dog_id: null,
      family_member_id: null,
      vehicle_id: null,
      area: null,
      limit: 200,
    }),
    listEvents(sql, {
      domain: "house",
      dog_id: null,
      family_member_id: null,
      vehicle_id: null,
      area: null,
      care_item_id: null,
      category: null,
      from: null,
      to: null,
      include_voided: false,
      limit: 200,
      offset: 0,
    }),
  ]);
  const looseEvents = events.filter((event) => event.area_id === null);
  return {
    active_items: sortActive(items.filter((item) => item.area_id === null), today),
    events: looseEvents,
    summary: summarizeHistory(looseEvents, { today }),
  };
}
