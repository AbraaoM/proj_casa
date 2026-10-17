/**
 * Runs against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
 * The database is wiped (schema public is dropped), so the URL must point to a
 * local or throwaway database whose name contains "test".
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npm run test:db
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations, MIGRATIONS_DIR } from "@/lib/db/migrate";
import { splitSql } from "@/lib/db/split-sql";
import { createArea, updateArea } from "@/lib/services/areas";
import { createEvent, listEvents, updateEvent } from "@/lib/services/events";
import { getSubjectHistory } from "@/lib/services/history";
import { createItem, listItems, updateItem } from "@/lib/services/items";
import { createDog, createVehicle } from "@/lib/services/subjects";
import { getDog, getVehicle } from "@/lib/repositories/subjects";
import type { CreateEventInput, EventListQuery } from "@/lib/domain/events";
import type { CreateItemInput } from "@/lib/domain/validate";

const url = process.env.TEST_DATABASE_URL;
const TODAY = "2026-10-16";

function eventInput(overrides: Partial<CreateEventInput>): CreateEventInput {
  return {
    care_item_id: null,
    domain: null,
    dog_id: null,
    family_member_id: null,
    vehicle_id: null,
    area_id: null,
    area_slug: null,
    category: null,
    title: null,
    done_on: null,
    notes: null,
    provider: null,
    weight_kg: null,
    odometer_km: null,
    amount_cents: null,
    external_key: null,
    ...overrides,
  };
}

function itemInput(overrides: Partial<CreateItemInput>): CreateItemInput {
  return {
    domain: "house",
    dog_id: null,
    family_member_id: null,
    vehicle_id: null,
    area_id: null,
    area_slug: null,
    title: "Item",
    category: "other",
    status: "active",
    priority: "normal",
    due_date: null,
    last_done_on: null,
    interval_days: null,
    notes: null,
    external_key: null,
    ...overrides,
  };
}

const listAll: EventListQuery = {
  domain: null,
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
};

describe.skipIf(!url)("history and areas on Postgres", () => {
  let sql: Sql;
  let legacyEventId = "";
  let legacyDogId = "";

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");

    // Old shape first: an event that only knows its item.
    await applyMigrations(sql, { until: "003_agent_keys" });
    const [dog] = await sql.query<{ id: string }>("INSERT INTO dogs (name) VALUES ('Thor') RETURNING id");
    legacyDogId = dog!.id;
    const [item] = await sql.query<{ id: string }>(
      "INSERT INTO care_items (domain, dog_id, title, category) VALUES ('dog', $1, 'V10', 'vaccine') RETURNING id",
      [legacyDogId],
    );
    const [event] = await sql.query<{ id: string }>(
      "INSERT INTO care_events (care_item_id, done_on) VALUES ($1, '2025-10-01') RETURNING id",
      [item!.id],
    );
    legacyEventId = event!.id;

    await applyMigrations(sql);
  });

  test("004 backfills subject, category and title on old events", async () => {
    const [row] = await sql.query(
      "SELECT domain, dog_id, category, title FROM care_events WHERE id = $1",
      [legacyEventId],
    );
    expect(row).toEqual({ domain: "dog", dog_id: legacyDogId, category: "vaccine", title: "V10" });
  });

  test("004 can run again statement by statement", async () => {
    const source = readFileSync(path.join(MIGRATIONS_DIR, "004_history_areas.sql"), "utf8");
    for (const statement of splitSql(source)) await sql.query(statement);
    const [count] = await sql.query<{ n: string }>("SELECT count(*)::text AS n FROM care_events");
    expect(count?.n).toBe("1");
  });

  test("the database refuses an area on a non-house event", async () => {
    const area = await createArea(sql, { slug: "sala", name: "Sala", kind: "room", sort_order: 0, notes: null });
    await expect(
      sql.query(
        "INSERT INTO care_events (domain, dog_id, area_id, category, title, done_on) VALUES ('dog', $1, $2, 'vet', 'x', '2026-01-01')",
        [legacyDogId, area.area.id],
      ),
    ).rejects.toThrow(/care_events_subject_matches_domain/);
  });

  test("areas are idempotent by slug and items attach by slug", async () => {
    const first = await createArea(sql, { slug: "cozinha", name: "Cozinha", kind: "room", sort_order: 1, notes: null });
    const again = await createArea(sql, { slug: "cozinha", name: "Outro nome", kind: "outdoor", sort_order: 9, notes: null });
    expect(first.idempotentReplay).toBe(false);
    expect(again).toMatchObject({ idempotentReplay: true, area: { id: first.area.id, name: "Cozinha" } });

    const created = await createItem(sql, itemInput({ title: "Limpar coifa", category: "cleaning", area_slug: "cozinha" }));
    expect(created.item).toMatchObject({ area_id: first.area.id, area_slug: "cozinha", subject_name: "Cozinha" });
    const listed = await listItems(sql, {
      domain: null, status: null, dog_id: null, family_member_id: null, vehicle_id: null, area: "cozinha", limit: 10,
    });
    expect(listed.map((item) => item.id)).toEqual([created.item.id]);

    await expect(updateItem(sql, created.item.id, { domain: "finance" })).rejects.toMatchObject({
      details: [{ field: "area_id", message: "must be empty for this domain" }],
    });

    await updateArea(sql, "cozinha", { archived: true });
    await expect(
      createItem(sql, itemInput({ title: "Outra", category: "cleaning", area_slug: "cozinha" })),
    ).rejects.toMatchObject({ details: [{ field: "area", message: "is archived" }] });
    await updateArea(sql, "cozinha", { archived: false });
  });

  test("dog weight follows the newest live weight, also after voiding", async () => {
    const dog = await createDog(sql, { name: "Luna", breed: null, sex: "female", birth_date: null, weight_kg: null, notes: null });
    const base = { domain: "dog" as const, dog_id: dog.id, category: "weight", title: "Pesagem" };
    await createEvent(sql, eventInput({ ...base, done_on: "2026-09-01", weight_kg: 11 }), TODAY);
    const newest = await createEvent(sql, eventInput({ ...base, done_on: "2026-10-01", weight_kg: 12 }), TODAY);
    await createEvent(sql, eventInput({ ...base, done_on: "2026-08-01", weight_kg: 9 }), TODAY);
    expect((await getDog(sql, dog.id))?.weight_kg).toBe(12);

    const voided = await updateEvent(sql, newest.event.id, { voided: true }, TODAY);
    expect(voided.event.voided_at).not.toBeNull();
    expect((await getDog(sql, dog.id))?.weight_kg).toBe(11);

    const live = await listEvents(sql, { ...listAll, dog_id: dog.id });
    expect(live.map((event) => event.done_on)).toEqual(["2026-09-01", "2026-08-01"]);
    const all = await listEvents(sql, { ...listAll, dog_id: dog.id, include_voided: true });
    expect(all).toHaveLength(3);
  });

  test("an external_key replays the first event", async () => {
    const dog = await createDog(sql, { name: "Bob", breed: null, sex: "male", birth_date: null, weight_kg: null, notes: null });
    const body = eventInput({ domain: "dog", dog_id: dog.id, category: "vet", title: "Consulta", done_on: "2026-10-01", external_key: "bob-vet" });
    const first = await createEvent(sql, body, TODAY);
    const second = await createEvent(sql, { ...body, title: "Outra" }, TODAY);
    expect(second).toMatchObject({ idempotentReplay: true, event: { id: first.event.id, title: "Consulta" } });
  });

  test("an event with care_item_id marks the item done and carries its subject", async () => {
    const car = await createVehicle(sql, {
      name: "Onix", make: "Chevrolet", model: "Onix", year: 2020, plate: null, odometer_km: 40000, notes: null,
    });
    const { item } = await createItem(
      sql,
      itemInput({ domain: "car", vehicle_id: car.id, title: "Troca de óleo", category: "oil", due_date: "2026-10-10", interval_days: 180 }),
    );
    const result = await createEvent(
      sql,
      eventInput({ care_item_id: item.id, done_on: "2026-10-12", odometer_km: 45200, amount_cents: 32000, provider: "Oficina Zé" }),
      TODAY,
    );
    expect(result.event).toMatchObject({
      care_item_id: item.id, domain: "car", vehicle_id: car.id, category: "oil", title: "Troca de óleo", provider: "Oficina Zé",
    });
    expect(result.item).toMatchObject({ last_done_on: "2026-10-12", due_date: "2027-04-10" });
    expect((await getVehicle(sql, car.id))?.odometer_km).toBe(45200);

    const history = await getSubjectHistory(sql, "vehicle", car.id, TODAY);
    expect(history.summary.oil).toMatchObject({ done_on: "2026-10-12", km_since: 0, days_since: 4 });
    expect(history.summary.costs.year_total_cents).toBe(32000);
    expect(history.active_items.map((active) => active.id)).toEqual([item.id]);
  });

  test("area history lists house events of that area only", async () => {
    await createEvent(sql, eventInput({ domain: "house", area_slug: "sala", category: "deep_clean", title: "Faxina", done_on: "2026-10-05" }), TODAY);
    await createEvent(sql, eventInput({ domain: "house", category: "repair", title: "Geral", done_on: "2026-10-06" }), TODAY);
    const history = await getSubjectHistory(sql, "area", "sala", TODAY);
    expect(history.events.map((event) => event.title)).toEqual(["Faxina"]);
    expect(history.events[0]).toMatchObject({ area_slug: "sala", subject_name: "Sala" });
    expect(history.summary.last_by_category.deep_clean?.days_since).toBe(11);
  });
});
