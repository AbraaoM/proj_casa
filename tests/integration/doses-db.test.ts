/**
 * Runs against a real Postgres. Skipped unless TEST_DATABASE_URL is set (see history-db.test.ts).
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/doses-db.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations, MIGRATIONS_DIR } from "@/lib/db/migrate";
import { splitSql } from "@/lib/db/split-sql";
import { getItem } from "@/lib/repositories/items";
import { recordDose, sqlDoseStore, listMedications, getItemDoses } from "@/lib/services/doses";
import { updateEvent } from "@/lib/services/events";
import { getSubjectHistory } from "@/lib/services/history";
import { createItem, updateItem } from "@/lib/services/items";
import type { CreateItemInput } from "@/lib/domain/validate";

const url = process.env.TEST_DATABASE_URL;
const TODAY = "2026-10-17";
const CLOCK = { now: "2026-10-17T13:00:00.000Z", timeZone: "America/Sao_Paulo" };

function medicine(memberId: string, overrides: Partial<CreateItemInput> = {}): CreateItemInput {
  return {
    domain: "family", dog_id: null, family_member_id: memberId, vehicle_id: null, area_id: null, area_slug: null,
    title: "Dipirona", category: "medicine", status: "active", priority: "normal", due_date: TODAY,
    last_done_on: null, interval_days: null, interval_months: null, interval_hours: 6, ends_on: null,
    notes: null, external_key: null, ...overrides,
  };
}

describe.skipIf(!url)("medication doses on Postgres", () => {
  let sql: Sql;
  let kid = "";
  let legacyItem = "";

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    // Data in the shape master writes today, before 006.
    await applyMigrations(sql, { until: "005_finance" });
    const [member] = await sql.query<{ id: string }>("INSERT INTO family_members (name) VALUES ('Bebê') RETURNING id");
    kid = member!.id;
    const [item] = await sql.query<{ id: string }>(
      `INSERT INTO care_items (domain, family_member_id, title, category, due_date, notes)
       VALUES ('family', $1, 'Amoxicilina de 8 em 8 horas', 'medicine', '2026-10-17', 'Amoxicilina 2026-10-17 01:30')
       RETURNING id`,
      [kid],
    );
    legacyItem = item!.id;
    await applyMigrations(sql);
  });

  test("006 runs twice and keeps old rows and old writes valid", async () => {
    const source = readFileSync(path.join(MIGRATIONS_DIR, "006_medication_doses.sql"), "utf8");
    for (const statement of splitSql(source)) await sql.query(statement);
    const item = await getItem(sql, legacyItem);
    expect(item).toMatchObject({ interval_hours: null, next_due_at: null, ends_on: null, due_date: "2026-10-17" });
    // What master does: day/month schedules and events without a time.
    await sql.query("UPDATE care_items SET interval_days = 1 WHERE id = $1", [legacyItem]);
    await sql.query("UPDATE care_items SET interval_days = NULL, interval_months = 1 WHERE id = $1", [legacyItem]);
    await sql.query(
      `INSERT INTO care_events (care_item_id, domain, family_member_id, category, title, done_on)
       VALUES ($1, 'family', $2, 'medicine', 'Amoxicilina', '2026-10-16')`,
      [legacyItem, kid],
    );
    await expect(
      sql.query("UPDATE care_items SET interval_hours = 8 WHERE id = $1", [legacyItem]),
    ).rejects.toThrow(/care_items_single_interval/);
  });

  test("PATCH to hourly clears the other schedules", async () => {
    const item = await updateItem(sql, legacyItem, { interval_hours: 8, interval_days: null, interval_months: null });
    expect(item).toMatchObject({ interval_hours: 8, interval_months: null, next_due_at: null });
  });

  test("a dose keeps the item active, moves the next dose, and repeats safely", async () => {
    const { item } = await createItem(sql, medicine(kid, { external_key: "family:bebe:dipirona" }));
    const store = sqlDoseStore(sql);
    const first = await recordDose(store, item.id, { given_at: "2026-10-17T07:30", notes: null, external_key: "dose:dipirona:0730" }, CLOCK);
    expect(first.event).toMatchObject({ done_at: "2026-10-17T10:30:00.000Z", done_on: "2026-10-17" });
    expect(first.item).toMatchObject({ status: "active", next_due_at: "2026-10-17T16:30:00.000Z", last_done_at: "2026-10-17T10:30:00.000Z" });

    const again = await recordDose(store, item.id, { given_at: "2026-10-17T07:30:00-03:00", notes: null, external_key: "dose:dipirona:0730" }, CLOCK);
    const sameMinute = await recordDose(store, item.id, { given_at: "2026-10-17T07:30:40", notes: null, external_key: null }, CLOCK);
    expect([again.idempotentReplay, sameMinute.idempotentReplay]).toEqual([true, true]);

    const earlier = await recordDose(store, item.id, { given_at: "2026-10-17T00:15", notes: null, external_key: null }, CLOCK);
    expect(earlier.item.next_due_at).toBe("2026-10-17T16:30:00.000Z");

    const view = await getItemDoses(sql, item.id, { from: null, to: null, include_voided: false, limit: 100 }, CLOCK);
    expect(view.doses.map((dose) => dose.done_at)).toEqual(["2026-10-17T10:30:00.000Z", "2026-10-17T03:15:00.000Z"]);
    expect(view).toMatchObject({ next_due_time: "13:30", late: false });

    // Voiding the newest dose brings the schedule back to the one before.
    const voided = await updateEvent(sql, first.event.id, { voided: true }, TODAY);
    expect(voided.notes[0]).toMatch(/recomputed/);
    expect((await getItem(sql, item.id))?.next_due_at).toBe("2026-10-17T09:15:00.000Z");
  });

  test("ends_on completes the treatment when the next dose would fall after it", async () => {
    const { item } = await createItem(sql, medicine(kid, { title: "Vitamina D", interval_hours: 24, ends_on: "2026-10-18" }));
    const store = sqlDoseStore(sql);
    const day1 = await recordDose(store, item.id, { given_at: "2026-10-17T01:30", notes: null, external_key: null }, CLOCK);
    expect(day1.item.status).toBe("active");
    const ended = await updateItem(sql, item.id, { ends_on: "2026-10-17" });
    expect(ended).toMatchObject({ status: "completed", next_due_at: null });
  });

  test("the family page data lists active medication with its doses", async () => {
    const meds = await listMedications(sql, kid, CLOCK);
    expect(meds.map((med) => med.item.title)).toEqual(["Dipirona", "Amoxicilina de 8 em 8 horas"]);
    expect(meds[0]).toMatchObject({ late: true, next_due_time: "06:15" });
    const history = await getSubjectHistory(sql, "family", kid, TODAY, CLOCK);
    expect(history.kind === "family" && history.medications).toHaveLength(2);
    const dipirona = history.active_items.find((item) => item.title === "Dipirona");
    expect(dipirona).toMatchObject({ attention: "overdue", next_due_time: "06:15" });
  });
});
