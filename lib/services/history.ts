import type { Sql } from "@/lib/db/client";
import { attentionState } from "@/lib/domain/attention";
import { daysUntil } from "@/lib/domain/dates";
import { summarizeHistory, type HistorySummary } from "@/lib/domain/history";
import type {
  AttentionItem,
  CareEvent,
  Dog,
  FamilyMember,
  HouseArea,
  SubjectKind,
  Vehicle,
} from "@/lib/domain/types";
import { notFound } from "@/lib/errors";
import { getAreaByRef } from "@/lib/repositories/areas";
import { listEvents } from "@/lib/repositories/events";
import { listItems } from "@/lib/repositories/items";
import { getDog, getFamilyMember, getVehicle } from "@/lib/repositories/subjects";

export type SubjectHistory<S> = {
  subject: S;
  /** Every active item of the subject, most urgent first. */
  active_items: AttentionItem[];
  /** Live (not voided) events, newest first. */
  events: CareEvent[];
  summary: HistorySummary;
};

export type AnySubjectHistory =
  | ({ kind: "dog" } & SubjectHistory<Dog>)
  | ({ kind: "vehicle" } & SubjectHistory<Vehicle>)
  | ({ kind: "family" } & SubjectHistory<FamilyMember>)
  | ({ kind: "area" } & SubjectHistory<HouseArea>);

const EVENT_LIMIT = 200;

export async function getSubjectHistory(
  sql: Sql,
  kind: SubjectKind,
  ref: string,
  today: string,
): Promise<AnySubjectHistory> {
  const base = {
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
    limit: EVENT_LIMIT,
    offset: 0,
  };

  if (kind === "dog") {
    const dog = await getDog(sql, ref);
    if (!dog) throw notFound("Dog was not found.");
    const [items, events] = await Promise.all([
      activeItems(sql, { dog_id: dog.id }, today),
      listEvents(sql, { ...base, dog_id: dog.id }),
    ]);
    return { kind, subject: dog, active_items: items, events, summary: summarizeHistory(events, { today }) };
  }
  if (kind === "vehicle") {
    const vehicle = await getVehicle(sql, ref);
    if (!vehicle) throw notFound("Vehicle was not found.");
    const [items, events] = await Promise.all([
      activeItems(sql, { vehicle_id: vehicle.id }, today),
      listEvents(sql, { ...base, vehicle_id: vehicle.id }),
    ]);
    return {
      kind,
      subject: vehicle,
      active_items: items,
      events,
      summary: summarizeHistory(events, { today, odometer_km: vehicle.odometer_km }),
    };
  }
  if (kind === "family") {
    const member = await getFamilyMember(sql, ref);
    if (!member) throw notFound("Family member was not found.");
    const [items, events] = await Promise.all([
      activeItems(sql, { family_member_id: member.id }, today),
      listEvents(sql, { ...base, family_member_id: member.id }),
    ]);
    return { kind, subject: member, active_items: items, events, summary: summarizeHistory(events, { today }) };
  }
  const area = await getAreaByRef(sql, ref);
  if (!area) throw notFound("Area was not found.");
  const [items, events] = await Promise.all([
    activeItems(sql, { area: area.id }, today),
    listEvents(sql, { ...base, domain: "house", area: area.id }),
  ]);
  return { kind: "area", subject: area, active_items: items, events, summary: summarizeHistory(events, { today }) };
}

async function activeItems(
  sql: Sql,
  filter: { dog_id?: string; vehicle_id?: string; family_member_id?: string; area?: string },
  today: string,
): Promise<AttentionItem[]> {
  const items = await listItems(sql, {
    domain: null,
    status: "active",
    dog_id: filter.dog_id ?? null,
    family_member_id: filter.family_member_id ?? null,
    vehicle_id: filter.vehicle_id ?? null,
    area: filter.area ?? null,
    limit: 200,
  });
  return sortActive(items, today);
}

/** All active items (no window), in attention order: overdue, today, upcoming by date, undated. */
export function sortActive<T extends Parameters<typeof attentionState>[0] & { due_date: string | null; priority: AttentionItem["priority"] }>(
  items: T[],
  today: string,
): Array<T & Pick<AttentionItem, "attention" | "days_until_due">> {
  const rank = { overdue: 0, due_today: 1, upcoming: 2, undated: 3 } as const;
  const priority = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
  return items
    .map((item) => ({
      ...item,
      attention: attentionState(item, today, Number.MAX_SAFE_INTEGER) ?? "undated",
      days_until_due: item.due_date ? daysUntil(item.due_date, today) : null,
    }))
    .sort((left, right) => {
      const bucket = rank[left.attention] - rank[right.attention];
      if (bucket !== 0) return bucket;
      const days = (left.days_until_due ?? 0) - (right.days_until_due ?? 0);
      if (days !== 0) return days;
      return priority[left.priority] - priority[right.priority];
    });
}
