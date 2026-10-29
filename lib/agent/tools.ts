/**
 * The agent's tool catalog, shared by the MCP endpoint (/api/mcp) and the chat bot.
 * Each tool maps to the same parse functions and services as the REST routes in /api/agent,
 * so the rules (validation, idempotency, rescheduling) are the same.
 *
 * Finance rule: no tool creates a loose transaction. marcar_feito and registrar_evento take no
 * amount. When the finished task usually costs money, they answer ask_cost: true; the agent asks
 * and only then calls registrar_custo. conta_a_pagar, pagar_conta and definir_orcamento carry
 * amount_cents only for a number the person said.
 */
import { attribution } from "@/lib/agent/actor";
import type { Sql } from "@/lib/db/client";
import { parseAgendaCreate, parseWithinDays } from "@/lib/domain/calendar";
import { parseDoseBody, resolveGivenAt } from "@/lib/domain/doses";
import { parseAreaCreate, parseAreaPatch } from "@/lib/domain/areas";
import { parseDogCreate, parseDogPatch, parseFamilyCreate, parseFamilyPatch, parseSettingsPatch, parseVehicleCreate, parseVehiclePatch } from "@/lib/domain/entities";
import { parseCreateEvent, parseEventPatch } from "@/lib/domain/events";
import { ACCOUNT_KINDS, BILL_FREQUENCIES, BILL_KINDS } from "@/lib/domain/finance/types";
import { parseAccountCreate, parseAccountPatch, parseBalanceCheck, parseBillCreate, parseBillPatch, parseBudgetPut, parseMonthQuery, parsePay } from "@/lib/domain/finance/validate";
import { AREA_KINDS, DOMAINS, SEXES, SUBJECT_KINDS, type AttentionItem, type CareItem, type Clock, type Domain, type SubjectKind } from "@/lib/domain/types";
import { parseCreateItem, parseDoneBody, parseItemListQuery, parseItemPatch, parseRoutineQuery } from "@/lib/domain/validate";
import { AppError, notFound, validationError, type FieldError } from "@/lib/errors";
import { bumpOdometer } from "@/lib/repositories/events";
import { createArea, listAreas, updateArea } from "@/lib/services/areas";
import { listAttention } from "@/lib/services/attention";
import { getItemDoses, recordDose, sqlDoseStore } from "@/lib/services/doses";
import { completeItem, createEvent, getEvent, updateEvent } from "@/lib/services/events";
import { addBalanceCheck, createAccount, listAccountViews, reconcileAccount, updateAccount } from "@/lib/services/finance/accounts";
import { createBill, listBills, payBill, updateBill } from "@/lib/services/finance/bills";
import { putBudgets } from "@/lib/services/finance/budgets";
import { listCategories } from "@/lib/services/finance/categories";
import { getFinanceSummary } from "@/lib/services/finance/summary";
import { getSubjectHistory } from "@/lib/services/history";
import { createItem, listItems, updateItem } from "@/lib/services/items";
import { compactRoutine, listRoutines } from "@/lib/services/routines";
import { ROUTINE_KIT } from "@/lib/domain/routine-kit";
import { patchSettings, readSettings } from "@/lib/services/settings";
import { createDog, createFamily, createVehicle, listDogs, listFamily, listVehicles, updateDog, updateFamily, updateVehicle } from "@/lib/services/subjects";
import { isIsoDate, isUuid } from "@/lib/domain/dates";
import { createAgendaEvent, listHouseholdAgenda } from "@/lib/services/google-calendar";
import { fetchWeather } from "@/lib/weather/open-meteo";

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

const ROUTINE_RULE =
  "House routines (domain house + interval_days or interval_months) are the /casa checklist. The app has no screen to edit a frequency: creating, changing or removing one happens only here, when the person asks you. Confirm the change in one sentence.";

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

/** Current kilometres stated with a new car task. Stored on the vehicle, not as a past event. */
function readOdometer(args: Record<string, unknown>): number | undefined {
  if (!("odometer_km" in args)) return undefined;
  if (args.domain !== "car") {
    throw validationError("odometer_km is only allowed for domain car", [{ field: "odometer_km", message: "is only allowed for domain car" }]);
  }
  const km = args.odometer_km;
  if (typeof km !== "number" || !Number.isInteger(km) || km < 0 || km > 2_000_000) {
    throw validationError("odometer_km must be an integer from 0 to 2000000", [{ field: "odometer_km", message: "must be an integer from 0 to 2000000" }]);
  }
  return km;
}

function doseBound(raw: unknown, field: "from" | "to", timeZone: string, now: string): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw validationError(`${field} must be a date or an ISO date-time`, [{ field, message: "must be a date or an ISO date-time" }]);
  const text = isIsoDate(raw) ? `${raw}T${field === "from" ? "00:00" : "23:59:59"}` : raw;
  const resolved = resolveGivenAt(text, timeZone, new Date(now));
  if (!resolved) throw validationError(`${field} must be a date or an ISO date-time`, [{ field, message: "must be a date or an ISO date-time" }]);
  return resolved;
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
    name: "rotinas_casa",
    title: "Checklist da casa",
    description:
      "The house checklist (rotinas): each routine with its room, frequency, last time, who did it, days since, % of the interval used and status (overdue, never, due_soon, ok), most urgent first. Use it for 'quando limpei o banheiro', 'o que está mais atrasado na casa' or before suggesting routines. include_kit: true adds the suggested frequencies for rooms with no routine yet. " +
      ROUTINE_RULE,
    inputSchema: {
      type: "object",
      properties: {
        area: str("House area slug or id."),
        status: { type: "string", enum: ["overdue", "never", "due_soon", "ok"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        include_kit: { type: "boolean", description: "Add the suggested routine kit (title, category, frequency)." },
      },
      additionalProperties: false,
    },
    writes: false,
    async run(args, { sql, today, clock }) {
      const raw = only(args, ["area", "status", "limit", "include_kit"]);
      const { include_kit: includeKit, ...filters } = raw;
      const value = must(parseRoutineQuery(query(filters)), "query");
      const routines = await listRoutines(sql, { ...value, today, timeZone: clock.timeZone });
      return {
        as_of: today,
        routines: routines.map(compactRoutine),
        ...(includeKit === true ? { suggested_kit: ROUTINE_KIT } : {}),
      };
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
      "Cria uma pendência. Cão exige dog_id, família family_member_id, carro vehicle_id; casa pode levar area. Um intervalo: interval_days, interval_months ou interval_hours (remédio; 1x ao dia = 24). No carro, odometer_km grava o hodômetro e due_date fica em Próximos, sem virar evento. Rotina da casa (checklist): domain house + area + interval_days ou interval_months, category cleaning/deep_clean/maintenance, external_key 'rotina:<area>:<tarefa>' e, se a pessoa disser, last_done_on (o vencimento vira last_done_on + intervalo; sem ele, vence hoje). " +
      ROUTINE_RULE,
    inputSchema: {
      type: "object",
      properties: {
        domain: domainEnum,
        title: str("Short title, e.g. 'Vermífugo'."),
        category: str("Category slug, e.g. vaccine, deworming, oil, cleaning, dentist."),
        due_date: date("Due date YYYY-MM-DD in the household time zone. A future oil change goes here."),
        last_done_on: date("When it was last done (YYYY-MM-DD), if the person says. A house routine is then due one interval later."),
        interval_days: int("Repeat every N days. Do not send with another interval."),
        interval_months: int("Repeat every N months (keeps the day)."),
        interval_hours: int("Repeat every N hours, 1 to 168. Medicine once a day is 24."),
        ends_on: date("Last day of an hourly treatment."),
        odometer_km: int("Current car kilometres. Saved on the vehicle, not as a past event."),
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
      const km = readOdometer(args);
      const { odometer_km: _km, ...rest } = args;
      void _km;
      const value = must(parseCreateItem(rest), "item");
      const created = await createItem(sql, value);
      if (km !== undefined && created.item.vehicle_id) await bumpOdometer(sql, created.item.vehicle_id, km);
      return {
        item: compactItem(created.item),
        idempotent_replay: created.idempotentReplay,
        ...(km !== undefined ? { odometer_km: km } : {}),
      };
    },
  },
  {
    name: "atualizar_item",
    title: "Corrigir pendência",
    description:
      "Corrige uma pendência: título, categoria, status, prioridade, vencimento, um intervalo, ends_on ou notas. Rotina da casa: mudar a frequência = novo interval_days ou interval_months (o vencimento é recalculado da última vez); remover a frequência = interval_days: null (vira pendência avulsa); pausar = status paused; apagar = status cancelled. " +
      ROUTINE_RULE,
    inputSchema: {
      type: "object",
      properties: {
        item_id: uuid("Task id."),
        domain: domainEnum,
        title: str("Short title."),
        category: str("Category slug."),
        status: { type: "string", enum: ["active", "paused", "completed", "cancelled"] },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        due_date: date("Due date YYYY-MM-DD, or null to clear."),
        last_done_on: date("When it was last done (YYYY-MM-DD). A house routine is then due one interval later."),
        interval_days: { type: ["integer", "null"], description: "Repeat every N days. Clears the other intervals. null removes the frequency." },
        interval_months: { type: ["integer", "null"], description: "Repeat every N months. Clears the other intervals. null removes the frequency." },
        interval_hours: int("Repeat every N hours, 1 to 168. Clears the other intervals."),
        ends_on: date("Last day of an hourly treatment, or null to clear."),
        notes: str("Notes, or null to clear."),
        ...SUBJECT_IDS,
      },
      required: ["item_id"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql }) {
      const id = String(args.item_id ?? "");
      if (!isUuid(id)) throw notFound("Item was not found.");
      const { item_id: _id, ...rest } = args;
      void _id;
      return { item: compactItem(await updateItem(sql, id, must(parseItemPatch(rest), "item"))) };
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
    name: "listar_doses",
    title: "Doses do remédio",
    description: "Lista as doses de um remédio e a próxima. from e to são dia ou data e hora.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: uuid("Medication task id."),
        from: str("Start, YYYY-MM-DD or ISO date-time."),
        to: str("End, YYYY-MM-DD or ISO date-time."),
        include_voided: { type: "boolean", description: "Include voided doses." },
      },
      required: ["item_id"],
      additionalProperties: false,
    },
    writes: false,
    async run(args, { sql, clock }) {
      const raw = only(args, ["item_id", "from", "to", "include_voided"]);
      const id = String(raw.item_id ?? "");
      if (!isUuid(id)) throw notFound("Item was not found.");
      const view = await getItemDoses(sql, id, {
        from: doseBound(raw.from, "from", clock.timeZone, clock.now),
        to: doseBound(raw.to, "to", clock.timeZone, clock.now),
        include_voided: raw.include_voided === true,
        limit: 30,
      }, clock);
      return {
        next_due_at: view.next_due_at,
        next_due_time: view.next_due_time,
        minutes_until_next: view.minutes_until_next,
        late: view.late,
        doses: view.doses.slice(0, 20).map((dose) => ({
          id: dose.id, done_at: dose.done_at, notes: dose.notes, voided: dose.voided_at !== null,
        })),
      };
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
    name: "anular_evento",
    title: "Anular registro",
    description: "Anula um evento ou uma dose errados. voided false desfaz. Nada é apagado.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: uuid("Event id."),
        voided: { type: "boolean", description: "True voids it (default). False restores it." },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["event_id", "voided"]);
      const id = String(raw.event_id ?? "");
      if (!isUuid(id)) throw notFound("Event was not found.");
      const patch = must(parseEventPatch({ voided: raw.voided === undefined ? true : raw.voided }), "event");
      const result = await updateEvent(sql, id, patch, today);
      return { event: { id: result.event.id, voided: result.event.voided_at !== null }, notes: result.notes };
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
    name: "cadastrar",
    title: "Cadastrar sujeito",
    description: "Cria ou atualiza cão, pessoa, carro ou área. Com id (slug na área), atualiza; archived true arquiva. Criar exige name.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["dog", "family", "vehicle", "area"] },
        id: str("Id to update. For an area, the slug works too."),
        name: str("Name."),
        slug: str("Area slug, when creating an area."),
        area_kind: { type: "string", enum: [...AREA_KINDS], description: "room, outdoor or system." },
        archived: { type: "boolean" },
        notes: str("Notes."),
        breed: str("Dog breed."),
        sex: { type: "string", enum: [...SEXES] },
        birth_date: date("Birth date."),
        weight_kg: { type: "number", description: "Dog weight." },
        relationship: str("How the person is related."),
        make: str("Car make."),
        model: str("Car model."),
        year: int("Car year."),
        plate: str("Plate."),
        odometer_km: int("Current kilometres, when creating or updating the car."),
        sort_order: int("Area order."),
      },
      required: ["kind"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql }) {
      const raw = only(args, ["kind", "id", "name", "slug", "area_kind", "archived", "notes", "breed", "sex", "birth_date", "weight_kg", "relationship", "make", "model", "year", "plate", "odometer_km", "sort_order"]);
      const kind = raw.kind;
      if (kind !== "dog" && kind !== "family" && kind !== "vehicle" && kind !== "area") {
        throw validationError("kind is not valid", [{ field: "kind", message: "is not valid" }]);
      }
      const id = raw.id === undefined || raw.id === null ? null : String(raw.id);
      const body: Record<string, unknown> = {};
      for (const key of ["name", "notes", "breed", "sex", "birth_date", "weight_kg", "relationship", "make", "model", "year", "plate", "odometer_km", "archived"]) {
        if (key in raw) body[key] = raw[key];
      }
      if (!id && kind === "area") {
        if ("slug" in raw) body.slug = raw.slug;
        if ("sort_order" in raw) body.sort_order = raw.sort_order;
        if ("area_kind" in raw) body.kind = raw.area_kind;
      } else if (kind === "area") {
        if ("sort_order" in raw) body.sort_order = raw.sort_order;
        if ("area_kind" in raw) body.kind = raw.area_kind;
      }
      if (kind === "dog") {
        if (id) {
          if (!isUuid(id)) throw notFound("Dog was not found.");
          return { dog: await updateDog(sql, id, must(parseDogPatch(body), "dog")) };
        }
        return { dog: await createDog(sql, must(parseDogCreate(body), "dog")) };
      }
      if (kind === "family") {
        if (id) {
          if (!isUuid(id)) throw notFound("Family member was not found.");
          return { family: await updateFamily(sql, id, must(parseFamilyPatch(body), "family")) };
        }
        return { family: await createFamily(sql, must(parseFamilyCreate(body), "family")) };
      }
      if (kind === "vehicle") {
        if (id) {
          if (!isUuid(id)) throw notFound("Vehicle was not found.");
          return { vehicle: await updateVehicle(sql, id, must(parseVehiclePatch(body), "vehicle")) };
        }
        return { vehicle: await createVehicle(sql, must(parseVehicleCreate(body), "vehicle")) };
      }
      if (id) return { area: await updateArea(sql, id, must(parseAreaPatch(body), "area")) };
      const created = await createArea(sql, must(parseAreaCreate(body), "area"));
      return { area: created.area, idempotent_replay: created.idempotentReplay };
    },
  },
  {
    name: "clima",
    title: "Clima",
    description: "Tempo agora e se convém adiar tarefa ao ar livre.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    writes: false,
    async run(args, { sql }) {
      only(args, []);
      const settings = await readSettings(sql);
      const weather = await fetchWeather({ latitude: settings.latitude, longitude: settings.longitude, timezone: settings.timezone });
      if (!weather) return { available: false, city: settings.city };
      return { available: true, city: settings.city, ...weather };
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
  {
    name: "listar_financas",
    title: "Contas e contas a pagar",
    description: "Contas, categorias e contas a pagar (ativas, sugeridas e pausadas).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    writes: false,
    async run(args, { sql, today }) {
      only(args, []);
      const [accounts, categories, bills] = await Promise.all([
        listAccountViews(sql, today),
        listCategories(sql),
        listBills(sql, ["active", "suggested", "paused"]),
      ]);
      return {
        accounts: accounts.map((account) => ({ slug: account.slug, name: account.name, kind: account.kind, balance_cents: account.balance_cents })),
        categories: categories.map((category) => ({ slug: category.slug, name: category.name, kind: category.kind })),
        bills: bills.map((bill) => ({
          slug: bill.slug, name: bill.name, status: bill.status, amount_cents: bill.amount_cents,
          next_due_date: bill.next_due_date, frequency: bill.frequency, amount_varies: bill.amount_varies,
        })),
      };
    },
  },
  {
    name: "criar_conta",
    title: "Conta bancária",
    description: "Cria a conta com o saldo de abertura que a pessoa disse. Com ref, atualiza; archived true arquiva.",
    inputSchema: {
      type: "object",
      properties: {
        ref: str("Slug or id, when updating."),
        slug: str("Slug, when creating."),
        name: str("Name."),
        kind: { type: "string", enum: [...ACCOUNT_KINDS] },
        opening_balance_cents: int("Opening balance in cents, as the person said. A card or loan is what is owed."),
        opening_date: date("Opening date."),
        credit_limit_cents: int("Card limit in cents."),
        statement_close_day: int("Card statement close day, 1 to 31."),
        due_day: int("Card due day, 1 to 31."),
        notes: str("Notes."),
        archived: { type: "boolean" },
      },
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["ref", "slug", "name", "kind", "opening_balance_cents", "opening_date", "credit_limit_cents", "statement_close_day", "due_day", "notes", "archived"]);
      if (raw.ref) {
        const { ref: _ref, slug: _slug, ...rest } = raw;
        void _ref;
        void _slug;
        return { account: await updateAccount(sql, String(raw.ref), must(parseAccountPatch(rest), "account"), today) };
      }
      const { ref: _ref, archived: _archived, ...rest } = raw;
      void _ref;
      void _archived;
      const created = await createAccount(sql, must(parseAccountCreate(rest), "account"), today);
      return { account: created.account, idempotent_replay: created.idempotentReplay };
    },
  },
  {
    name: "conta_a_pagar",
    title: "Conta a pagar",
    description: "Cria ou corrige a conta a pagar que a pessoa confirmou, com o valor em centavos que ela disse. Sem ref, cria já active.",
    inputSchema: {
      type: "object",
      properties: {
        ref: str("Slug or id, when updating."),
        slug: str("Slug, when creating."),
        name: str("Name, e.g. Luz."),
        kind: { type: "string", enum: [...BILL_KINDS] },
        amount_cents: int("Amount in cents the person said."),
        amount_varies: { type: "boolean" },
        category: str("Finance category slug."),
        account: str("Account slug or id."),
        frequency: { type: "string", enum: [...BILL_FREQUENCIES] },
        interval: int("Every N periods."),
        day_of_month: int("Day of month, 1 to 31."),
        next_due_date: date("Next due date."),
        end_date: date("Last due date."),
        remaining: int("Installments left."),
        autopay: { type: "boolean" },
        status: { type: "string", enum: ["suggested", "active", "paused", "ended"] },
        notes: str("Notes."),
        external_key: externalKey,
      },
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql }) {
      const raw = only(args, ["ref", "slug", "name", "kind", "amount_cents", "amount_varies", "category", "account", "frequency", "interval", "day_of_month", "next_due_date", "end_date", "remaining", "autopay", "status", "notes", "external_key"]);
      if (raw.ref) {
        const { ref: _ref, slug: _slug, external_key: _key, ...rest } = raw;
        void _ref;
        void _slug;
        void _key;
        return { bill: await updateBill(sql, String(raw.ref), must(parseBillPatch(rest), "bill")) };
      }
      const { ref: _ref, ...rest } = raw;
      void _ref;
      const created = await createBill(sql, must(parseBillCreate(rest), "bill"));
      return { bill: created.bill, idempotent_replay: created.idempotentReplay };
    },
  },
  {
    name: "pagar_conta",
    title: "Pagar conta",
    description: "Paga uma conta a pagar. Sem amount_cents usa o valor da conta; se a pessoa disse outro, mande esse amount_cents.",
    inputSchema: {
      type: "object",
      properties: {
        ref: str("Bill slug or id."),
        paid_on: date("Payment date. Default today."),
        amount_cents: int("Amount in cents, only when the person said a different one."),
        account: str("Account slug or id."),
        notes: str("Notes."),
        external_key: externalKey,
      },
      required: ["ref"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["ref", "paid_on", "amount_cents", "account", "notes", "external_key"]);
      const ref = String(raw.ref ?? "");
      if (!ref) throw notFound("Bill was not found.");
      const { ref: _ref, ...rest } = raw;
      void _ref;
      const paid = await payBill(sql, ref, must(parsePay(rest), "payment"), today);
      return {
        bill: { slug: paid.bill.slug, next_due_date: paid.bill.next_due_date, status: paid.bill.status },
        event: { id: paid.event.id, done_on: paid.event.done_on },
        idempotent_replay: paid.idempotentReplay,
      };
    },
  },
  {
    name: "definir_orcamento",
    title: "Orçamento",
    description: "Define o teto de uma categoria de despesa com o valor em centavos que a pessoa disse. month vazio é o padrão; amount_cents null remove.",
    inputSchema: {
      type: "object",
      properties: {
        category: str("Expense category slug."),
        amount_cents: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Cap in cents the person said, or null to remove it." },
        month: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}$", description: "YYYY-MM, or null for the default budget." },
      },
      required: ["category", "amount_cents"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["category", "amount_cents", "month"]);
      const parsed = must(parseBudgetPut({ month: raw.month ?? null, items: [{ category: raw.category, amount_cents: raw.amount_cents }] }), "budget");
      return { budget: await putBudgets(sql, parsed, today) };
    },
  },
  {
    name: "conferir_conta",
    title: "Conferir saldo",
    description: "Grava o saldo que a pessoa leu no banco e concilia se o calculado bater.",
    inputSchema: {
      type: "object",
      properties: {
        account: str("Account slug or id."),
        date: date("The day the bank showed that balance."),
        balance_cents: int("Balance in cents, as shown by the bank. A card is what is owed."),
        external_key: externalKey,
      },
      required: ["account", "date", "balance_cents"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, today }) {
      const raw = only(args, ["account", "date", "balance_cents", "external_key"]);
      const account = String(raw.account ?? "");
      if (!account) throw notFound("Account was not found.");
      const check = must(parseBalanceCheck({ date: raw.date, balance_cents: raw.balance_cents, external_key: raw.external_key ?? null }, ), "balance");
      await addBalanceCheck(sql, account, check, today);
      const result = await reconcileAccount(sql, account, check.date, today);
      return {
        reconciled: result.reconciled,
        calculated_cents: result.calculated_cents,
        informed_cents: result.informed_cents,
        difference_cents: result.difference_cents,
        cleared_count: result.cleared_count,
      };
    },
  },
  {
    name: "ajustar_casa",
    title: "Cidade e fuso",
    description: "Lê a cidade da casa. Muda cidade, fuso ou coordenadas só quando a pessoa pedir.",
    inputSchema: {
      type: "object",
      properties: {
        city: str("City."),
        region: str("Region, e.g. SP."),
        country: str("Country, e.g. BR."),
        latitude: { type: "number" },
        longitude: { type: "number" },
        timezone: str("IANA time zone, e.g. America/Sao_Paulo."),
      },
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql }) {
      const raw = only(args, ["city", "region", "country", "latitude", "longitude", "timezone"]);
      const settings = Object.keys(raw).length === 0 ? await readSettings(sql) : await patchSettings(sql, must(parseSettingsPatch(raw), "settings"));
      return { city: settings.city, region: settings.region, country: settings.country, latitude: settings.latitude, longitude: settings.longitude, timezone: settings.timezone };
    },
  },
  {
    name: "agenda_proximos",
    title: "Agenda",
    description: "Lista os próximos compromissos do Google Agenda das contas já conectadas. Não conecta ninguém.",
    inputSchema: {
      type: "object",
      properties: { within_days: int("How many days ahead, from 1 to 30. Default 14.") },
      additionalProperties: false,
    },
    writes: false,
    async run(args, { sql, today, clock }) {
      const raw = only(args, ["within_days"]);
      const withinDays = must(parseWithinDays(raw.within_days), "agenda");
      return listHouseholdAgenda(sql, { today, timeZone: clock.timeZone, withinDays });
    },
  },
  {
    name: "agenda_criar",
    title: "Criar na agenda",
    description: "Cria um compromisso na Google Agenda de quem está falando, só com o que a pessoa pediu. Data sem hora é o dia inteiro.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Event title."),
        starts_at: str("AAAA-MM-DD for all day, or a date-time. Without a zone, the house time zone is used."),
        ends_at: str("Optional end. For an all-day event, the last day, inclusive."),
        description: str("Optional details."),
        location: str("Optional place."),
        external_key: externalKey,
      },
      required: ["title", "starts_at"],
      additionalProperties: false,
    },
    writes: true,
    async run(args, { sql, clock }) {
      const raw = only(args, ["title", "starts_at", "ends_at", "description", "location", "external_key"]);
      const draft = must(parseAgendaCreate(raw, clock.timeZone), "agenda");
      const created = await createAgendaEvent(sql, draft, clock.timeZone);
      return { event: created.event, idempotent_replay: created.idempotentReplay };
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
