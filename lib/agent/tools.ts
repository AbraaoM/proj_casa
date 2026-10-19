/**
 * The agent's tool catalog, shared by the MCP endpoint (/api/mcp) and the chat bot.
 * Each tool maps to the same parse functions and services as the REST routes in /api/agent,
 * so the rules (validation, idempotency, rescheduling) are the same.
 *
 * Finance rule: no tool creates a finance entry on the agent's own initiative.
 * marcar_feito and registrar_evento take no amount. When the finished task usually costs money,
 * they answer ask_cost: true, the agent asks the person how much it cost, and only with that
 * answer calls registrar_custo.
 */
import { attribution } from "@/lib/agent/actor";
import type { Sql } from "@/lib/db/client";
import { parseDoseBody } from "@/lib/domain/doses";
import { parseCreateEvent } from "@/lib/domain/events";
import { parseMonthQuery } from "@/lib/domain/finance/validate";
import { isUuid } from "@/lib/domain/dates";
import { DOMAINS, SUBJECT_KINDS, type AttentionItem, type CareItem, type Clock, type Domain, type SubjectKind } from "@/lib/domain/types";
import { parseCreateItem, parseDoneBody, parseItemListQuery } from "@/lib/domain/validate";
import { AppError, notFound, validationError, type FieldError } from "@/lib/errors";
import { listAreas } from "@/lib/services/areas";
import { listAttention } from "@/lib/services/attention";
import { recordDose, sqlDoseStore } from "@/lib/services/doses";
import { completeItem, createEvent, getEvent, updateEvent } from "@/lib/services/events";
import { getFinanceSummary } from "@/lib/services/finance/summary";
import { getSubjectHistory } from "@/lib/services/history";
import { createItem, listItems } from "@/lib/services/items";
import { listDogs, listFamily, listVehicles } from "@/lib/services/subjects";

export type ToolContext = { sql: Sql; today: string; clock: Clock };

type JsonSchema = Record<string, unknown>;

export type AgentTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema & { type: "object" };
  /** Writes something (logged in agent_activity). */
  writes: boolean;
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
};

/** Tasks that usually cost money: finishing one makes the agent ask for the cost. */
const COSTLY: Record<Domain, ReadonlySet<string>> = {
  dog: new Set(["vaccine", "deworming", "flea", "vet", "grooming", "dog_food"]),
  house: new Set(["repair", "filter", "deep_clean"]),
  car: new Set(["oil", "service", "inspection", "tire"]),
  family: new Set(["dentist", "medical", "medicine"]),
  finance: new Set(["gas", "dog_food", "bill", "purchase"]),
};

export function likelyCostsMoney(domain: Domain, category: string): boolean {
  return COSTLY[domain]?.has(category) ?? false;
}

/** How long after finishing a task its cost can still be added through registrar_custo. */
export const COST_WINDOW_HOURS = 72;

const ASK_COST_HINT = "Ask the person how much it cost. Call registrar_custo only with the amount they say; never guess.";

const str = (description: string): JsonSchema => ({ type: "string", description });
const int = (description: string): JsonSchema => ({ type: "integer", description });
const uuid = (description: string): JsonSchema => ({ type: "string", format: "uuid", description });
const date = (description: string): JsonSchema => ({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description });
const domainEnum: JsonSchema = { type: "string", enum: [...DOMAINS] };
const externalKey = str("Optional idempotency key. Repeating it returns the first record.");

function compactItem(item: CareItem | AttentionItem) {
  const attention = "attention" in item ? { attention: item.attention, days_until_due: item.days_until_due } : {};
  return {
    id: item.id,
    domain: item.domain,
    subject: item.subject_name ?? item.area_slug,
    title: item.title,
    category: item.category,
    status: item.status,
    priority: item.priority,
    due_date: item.due_date,
    ...(item.next_due_at ? { next_due_at: item.next_due_at } : {}),
    ...(item.interval_hours ? { interval_hours: item.interval_hours } : {}),
    ...attention,
  };
}

function must<T>(parsed: { ok: true; value: T } | { ok: false; details: FieldError[] }, label: string): T {
  if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? `Invalid ${label}.`, parsed.details);
  return parsed.value;
}

function only(args: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  const extra = Object.keys(args).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    throw validationError(`${extra[0]} is not a known field`, extra.map((field) => ({ field, message: "is not a known field" })));
  }
  return args;
}

function query(args: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) if (value !== undefined && value !== null) params.set(key, String(value));
  return params;
}

const SUBJECT_IDS = {
  dog_id: uuid("Dog id (domain dog)."),
  family_member_id: uuid("Family member id (domain family)."),
  vehicle_id: uuid("Vehicle id (domain car)."),
  area: str("House area slug (domain house). Without it: house, general."),
};

export const AGENT_TOOLS: readonly AgentTool[] = [
  {
    name: "atencao_hoje",
    title: "O que pede atenção",
    description:
      "Pending tasks that need attention: overdue, today and the next days, most urgent first. Start here for 'what do I have to do'.",
    inputSchema: {
      type: "object",
      properties: { domain: domainEnum, within_days: { type: "integer", minimum: 0, maximum: 90, description: "Window in days (default 14)." } },
      additionalProperties: false,
    },
    writes: false,
    async run(args, { sql, today, clock }) {
      const raw = only(args, ["domain", "within_days"]);
      const domain = typeof raw.domain === "string" && (DOMAINS as readonly string[]).includes(raw.domain) ? (raw.domain as Domain) : null;
      if (raw.domain !== undefined && raw.domain !== null && !domain) throw validationError("domain is not valid", [{ field: "domain", message: "is not valid" }]);
      const withinDays = raw.within_days === undefined ? 14 : Number(raw.within_days);
      if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > 90) {
        throw validationError("within_days must be 0 to 90", [{ field: "within_days", message: "must be 0 to 90" }]);
      }
      const attention = await listAttention(sql, { today, withinDays, domain, clock });
      return { as_of: today, summary: attention.summary, items: attention.items.slice(0, 30).map(compactItem) };
    },
  },
  {
    name: "listar_cadastros",
    title: "Cães, família, carros e áreas",
    description: "Ids and names of dogs, family members, vehicles and house areas. Use it to find the id other tools need.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    writes: false,
    async run(args, { sql }) {
      only(args, []);
      const [dogs, family, vehicles, areas] = await Promise.all([listDogs(sql, false), listFamily(sql, false), listVehicles(sql, false), listAreas(sql, false)]);
      return {
        dogs: dogs.map((dog) => ({ id: dog.id, name: dog.name })),
        family: family.map((person) => ({ id: person.id, name: person.name })),
        vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.name })),
        areas: areas.map((area) => ({ slug: area.slug, name: area.name })),
      };
    },
  },
  {
    name: "listar_itens",
    title: "Listar pendências",
    description: "Lists tasks with filters (domain, status, subject). For what needs attention now, prefer atencao_hoje.",
    inputSchema: {
      type: "object",
      properties: {
        domain: domainEnum,
        status: { type: "string", enum: ["active", "paused", "completed", "cancelled"] },
        dog_id: SUBJECT_IDS.dog_id,
        family_member_id: SUBJECT_IDS.family_member_id,
        vehicle_id: SUBJECT_IDS.vehicle_id,
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    writes: false,
    async run(args, { sql }) {
      const value = must(parseItemListQuery(query(only(args, ["domain", "status", "dog_id", "family_member_id", "vehicle_id", "limit"]))), "query");
      return { items: (await listItems(sql, value)).map(compactItem) };
    },
  },
  {
    name: "historico",
    title: "Histórico",
    description: "History of one dog, vehicle, family member or house area: pending tasks, the latest events and a summary (last by category, weights, costs this year).",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: [...SUBJECT_KINDS] }, id: str("Id (uuid), or the slug for an area.") },
      required: ["kind", "id"],
      additionalProperties: false,
    },
    writes: false,
    async run(args, { sql, today, clock }) {
      const raw = only(args, ["kind", "id"]);
      const kind = raw.kind as SubjectKind;
      if (!(SUBJECT_KINDS as readonly string[]).includes(String(raw.kind))) throw validationError("kind is not valid", [{ field: "kind", message: "is not valid" }]);
      const id = String(raw.id ?? "");
      if (!(isUuid(id) || (kind === "area" && /^[a-z0-9_]{1,40}$/.test(id)))) throw notFound();
      const history = (await getSubjectHistory(sql, kind, id, today, clock)) as unknown as Record<string, unknown> & {
        active_items: CareItem[];
        events: Array<Record<string, unknown>>;
      };
      return {
        ...history,
        active_items: history.active_items.map(compactItem),
        events: history.events.slice(0, 20).map((event) => ({
          id: event.id, done_on: event.done_on, category: event.category, title: event.title,
          notes: event.notes, provider: event.provider, amount_cents: event.amount_cents,
          weight_kg: event.weight_kg, odometer_km: event.odometer_km,
        })),
      };
    },
  },
  {
    name: "adicionar_item",
    title: "Nova pendência",
    description:
      "Creates a task or reminder. dog needs dog_id, family needs family_member_id, car needs vehicle_id; house may take an area slug. Repeat with interval_days or interval_months.",
    inputSchema: {
      type: "object",
      properties: {
        domain: domainEnum,
        title: str("Short title, e.g. 'Vermífugo'."),
        category: str("Category slug, e.g. vaccine, deworming, oil, cleaning, dentist."),
        due_date: date("Due date YYYY-MM-DD in the household time zone."),
        interval_days: int("Repeat every N days."),
        interval_months: int("Repeat every N months (keeps the day)."),
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        notes: str("Notes."),
        ...SUBJECT_IDS,
        external_key: externalKey,
      },
      required: ["domain", "title"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql }) {
      const value = must(parseCreateItem(args), "item");
      const created = await createItem(sql, value);
      return { item: compactItem(created.item), idempotent_replay: created.idempotentReplay };
    },
  },
  {
    name: "marcar_feito",
    title: "Marcar feito",
    description:
      "Marks a task done and reschedules it when it repeats. Takes no amount. If the answer has ask_cost: true, ask the person what it cost and then call registrar_custo with the event id.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: uuid("Task id."),
        done_on: date("When it was done (default today)."),
        notes: str("Notes."),
        provider: str("Clinic, garage or professional."),
        weight_kg: { type: "number", description: "Dog weight, if measured." },
        odometer_km: int("Odometer, for the car."),
        external_key: externalKey,
      },
      required: ["item_id"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["item_id", "done_on", "notes", "provider", "weight_kg", "odometer_km", "external_key"]);
      const id = String(raw.item_id ?? "");
      if (!isUuid(id)) throw notFound("Item was not found.");
      const { item_id: _ignored, ...body } = raw;
      void _ignored;
      const value = must(parseDoneBody(body), "done payload");
      const result = await completeItem(sql, id, value, today);
      const askCost = likelyCostsMoney(result.event.domain, result.event.category) && !result.transaction;
      return {
        item: result.item ? compactItem(result.item) : null,
        event: { id: result.event.id, done_on: result.event.done_on, title: result.event.title },
        paid: result.transaction ? { amount_cents: result.transaction.amount_cents } : null,
        idempotent_replay: result.idempotentReplay,
        ask_cost: askCost,
        ...(askCost ? { next_step: ASK_COST_HINT } : {}),
      };
    },
  },
  {
    name: "registrar_dose",
    title: "Dose dada",
    description: "Records a dose of an hourly medication (interval_hours) without finishing the treatment.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: uuid("Medication task id."),
        given_at: str("ISO time; without offset it is household time. Default now."),
        notes: str("Notes."),
        external_key: externalKey,
      },
      required: ["item_id"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, clock }) {
      const raw = only(args, ["item_id", "given_at", "notes", "external_key"]);
      const id = String(raw.item_id ?? "");
      if (!isUuid(id)) throw notFound("Item was not found.");
      const { item_id: _ignored, ...body } = raw;
      void _ignored;
      const result = await recordDose(sqlDoseStore(sql), id, must(parseDoseBody(body), "dose"), clock);
      return { item: compactItem(result.item), event: { id: result.event.id }, idempotent_replay: result.idempotentReplay };
    },
  },
  {
    name: "registrar_evento",
    title: "Registrar algo feito",
    description:
      "Records something done that had no task (vet visit, repair, weighing). Takes no amount. If ask_cost is true, ask the cost and call registrar_custo.",
    inputSchema: {
      type: "object",
      properties: {
        domain: domainEnum,
        category: str("Category slug."),
        title: str("What was done."),
        done_on: date("When (default today, never future)."),
        notes: str("Notes."),
        provider: str("Clinic, garage or professional."),
        weight_kg: { type: "number", description: "Dog only." },
        odometer_km: int("Car only."),
        ...SUBJECT_IDS,
        external_key: externalKey,
      },
      required: ["domain", "category", "title"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      if ("amount_cents" in args || "care_item_id" in args) {
        throw validationError("Use marcar_feito for a task and registrar_custo for a cost.", [{ field: "amount_cents", message: "is not accepted here" }]);
      }
      const result = await createEvent(sql, must(parseCreateEvent(args), "event"), today);
      const askCost = likelyCostsMoney(result.event.domain, result.event.category);
      return {
        event: { id: result.event.id, done_on: result.event.done_on, title: result.event.title },
        idempotent_replay: result.idempotentReplay,
        ask_cost: askCost,
        ...(askCost ? { next_step: ASK_COST_HINT } : {}),
      };
    },
  },
  {
    name: "registrar_custo",
    title: "Registrar o custo",
    description:
      `Adds the cost the person stated to a task just finished (event id from marcar_feito or registrar_evento, up to ${COST_WINDOW_HOURS} h, recorded by the same person). It becomes a finance entry. Only call it with an amount the person said; never estimate.`,
    inputSchema: {
      type: "object",
      properties: { event_id: uuid("Event id returned by marcar_feito or registrar_evento."), amount_cents: int("Amount in cents, e.g. 15000 for R$ 150,00.") },
      required: ["event_id", "amount_cents"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["event_id", "amount_cents"]);
      const id = String(raw.event_id ?? "");
      if (!isUuid(id)) throw notFound("Event was not found.");
      const amount = Number(raw.amount_cents);
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) {
        throw validationError("amount_cents must be a positive integer", [{ field: "amount_cents", message: "must be a positive integer" }]);
      }
      await assertCostAllowed(sql, id);
      const result = await updateEvent(sql, id, { amount_cents: amount }, today);
      return { event: { id: result.event.id, amount_cents: result.event.amount_cents }, transaction: result.transaction ? { id: result.transaction.id, amount_cents: result.transaction.amount_cents } : null };
    },
  },
  {
    name: "resumo_financeiro",
    title: "Resumo financeiro",
    description: "Month summary: income, expenses, result, by category, balances, bills due in 30 days and budget overruns. Read only.",
    inputSchema: { type: "object", properties: { month: { type: "string", pattern: "^\\d{4}-\\d{2}$", description: "YYYY-MM (default this month)." } }, additionalProperties: false },
    writes: false,
    async run(args, { sql, today }) {
      const raw = only(args, ["month"]);
      const month = must(parseMonthQuery(query(raw), today), "month");
      return { summary: await getFinanceSummary(sql, month, today) };
    },
  },
];

/**
 * registrar_custo only completes the ask-cost flow: the event must be recent, live,
 * without a cost yet, and recorded by the same person who is calling now.
 */
export async function assertCostAllowed(sql: Sql, eventId: string, now = new Date()): Promise<void> {
  const event = await getEvent(sql, eventId);
  const rows = await sql.query<{ created_by_user_id: string | null; created_at: unknown }>(
    "SELECT created_by_user_id::text AS created_by_user_id, created_at FROM care_events WHERE id = $1::uuid",
    [eventId],
  );
  const row = rows[0];
  const who = attribution().userId;
  const createdAt = row ? new Date(row.created_at as string) : null;
  const reason =
    event.voided_at ? "the event was voided"
    : event.amount_cents !== null ? "the event already has a cost; correct it with PATCH /api/agent/events/:id"
    : !row || !createdAt || now.getTime() - createdAt.getTime() > COST_WINDOW_HOURS * 3_600_000 ? `the event is older than ${COST_WINDOW_HOURS} h`
    : who !== null && row.created_by_user_id !== who ? "the event was recorded by someone else"
    : null;
  if (reason) throw new AppError("validation_error", `registrar_custo is only for a task just finished: ${reason}.`, 400, [{ field: "event_id", message: reason }]);
}

export function findTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name);
}
