import { tryGetSql, type Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { todayInTimeZone } from "@/lib/domain/dates";
import { DEFAULT_LOCATION, type Domain, type AttentionItem, type AttentionSummary, type HouseholdSettings } from "@/lib/domain/types";
import { listDogs, listFamily, listVehicles } from "@/lib/repositories/subjects";
import type { FinBill } from "@/lib/domain/finance/types";
import { listBills } from "@/lib/repositories/finance";
import { listAttention } from "@/lib/services/attention";
import { getBudgetView } from "@/lib/services/finance/budgets";
import { clockFor, fallbackSettings, readSettings } from "@/lib/services/settings";
import { fetchWeather, type WeatherSnapshot } from "@/lib/weather/open-meteo";

export type DashboardData =
  | {
      status: "unconfigured";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
    }
  | {
      status: "schema_missing";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
    }
  | {
      status: "error";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
    }
  | {
      status: "ready";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
      today: string;
      items: AttentionItem[];
      summary: AttentionSummary;
      /** Active subjects per domain, for the shortcuts under each section. */
      subjects: Partial<Record<Domain, SubjectLink[]>>;
      /** null when finance is not set up yet (or 005 is missing). */
      finance: DashboardFinance | null;
    };

export type DashboardFinance = {
  month: string;
  expense_cents: number;
  budget_cents: number;
  suggested: FinBill[];
};

export type SubjectLink = { id: string; name: string; href: string };

export async function loadDashboard(): Promise<DashboardData> {
  const sql = tryGetSql();
  if (!sql) {
    const settings = fallbackSettings();
    return { status: "unconfigured", settings, weather: await fetchWeather(settings) };
  }
  return loadFromDatabase(sql);
}

async function loadFromDatabase(sql: Sql): Promise<DashboardData> {
  const fallback = fallbackSettings();
  try {
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const [attention, weather, subjects, finance] = await Promise.all([
      listAttention(sql, { today, withinDays: 14, domain: null, clock: clockFor(settings) }),
      fetchWeather(settings),
      loadSubjects(sql),
      loadFinance(sql, today),
    ]);
    return { status: "ready", settings, weather, today, ...attention, subjects, finance };
  } catch (error) {
    const weather = await fetchWeather(fallback);
    if (isMissingSchema(error)) {
      return { status: "schema_missing", settings: fallback, weather };
    }
    console.error(error);
    return { status: "error", settings: { ...fallback, ...DEFAULT_LOCATION }, weather };
  }
}

/** The month's spending against the budget, and suggested bills. Never breaks the dashboard. */
async function loadFinance(sql: Sql, today: string): Promise<DashboardFinance | null> {
  try {
    const month = today.slice(0, 7);
    const [budget, suggested] = await Promise.all([getBudgetView(sql, month), listBills(sql, ["suggested"])]);
    return { month, expense_cents: budget.total_spent_cents, budget_cents: budget.total_budget_cents, suggested };
  } catch (error) {
    if (!isMissingSchema(error)) console.error(error);
    return null;
  }
}

async function loadSubjects(sql: Sql): Promise<Partial<Record<Domain, SubjectLink[]>>> {
  const [dogs, vehicles, family] = await Promise.all([
    listDogs(sql, false),
    listVehicles(sql, false),
    listFamily(sql, false),
  ]);
  return {
    dog: dogs.map((dog) => ({ id: dog.id, name: dog.name, href: `/caes/${dog.id}` })),
    car: vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.name, href: `/carros/${vehicle.id}` })),
    family: family.map((member) => ({ id: member.id, name: member.name, href: `/familia/${member.id}` })),
  };
}
