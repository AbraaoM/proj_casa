export const DOMAINS = ["dog", "house", "finance", "car", "family"] as const;
export type Domain = (typeof DOMAINS)[number];

export const ITEM_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ATTENTION_STATES = ["overdue", "due_today", "upcoming", "undated"] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

export const SEXES = ["male", "female", "unknown"] as const;
export type Sex = (typeof SEXES)[number];

export const AREA_KINDS = ["room", "outdoor", "system"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/** Subjects that own a history page: dog, vehicle, family member, house area. */
export const SUBJECT_KINDS = ["dog", "vehicle", "family", "area"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const DEFAULT_WITHIN_DAYS = 14;
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export const DEFAULT_LOCATION = {
  city: "Pindamonhangaba",
  region: "SP",
  country: "BR",
  latitude: -22.9239,
  longitude: -45.4617,
  timezone: DEFAULT_TIMEZONE,
} as const;

export const RECOMMENDED_CATEGORIES: Record<Domain, readonly string[]> = {
  dog: ["vaccine", "deworming", "flea", "vet", "weight", "grooming", "other"],
  house: ["cleaning", "deep_clean", "repair", "outdoor", "filter", "other"],
  finance: ["gas", "dog_food", "bill", "purchase", "other"],
  car: ["oil", "service", "inspection", "tire", "other"],
  family: ["vaccine", "dentist", "medical", "medicine", "other"],
};

export type CareItem = {
  id: string;
  domain: Domain;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  area_id: string | null;
  area_slug: string | null;
  subject_name: string | null;
  title: string;
  category: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  last_done_on: string | null;
  interval_days: number | null;
  /** Monthly schedule (keeps the day of month). Exclusive with interval_days. */
  interval_months: number | null;
  /** Hourly schedule, for medication. Exclusive with interval_days and interval_months. */
  interval_hours: number | null;
  /** Time of the newest live dose (hourly items). */
  last_done_at: string | null;
  /** When the next dose is due (hourly items). due_date is its day in the household time zone. */
  next_due_at: string | null;
  /** Last day of treatment. The item completes itself when the next dose would fall after it. */
  ends_on: string | null;
  notes: string | null;
  created_by_agent: boolean;
  external_key: string | null;
  created_at: string;
  updated_at: string;
};

export type CareEvent = {
  id: string;
  care_item_id: string | null;
  domain: Domain;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  area_id: string | null;
  area_slug: string | null;
  subject_name: string | null;
  category: string;
  title: string;
  done_on: string;
  /** Exact time, when known (medication doses). done_on is its day in the household time zone. */
  done_at: string | null;
  notes: string | null;
  provider: string | null;
  weight_kg: number | null;
  odometer_km: number | null;
  amount_cents: number | null;
  voided_at: string | null;
  created_by_agent: boolean;
  external_key: string | null;
  created_at: string;
  updated_at: string;
};

export type HouseArea = {
  id: string;
  slug: string;
  name: string;
  kind: AreaKind;
  sort_order: number;
  notes: string | null;
  archived_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type DomainCounts = {
  overdue: number;
  due_soon: number;
  total_active: number;
};

export type AttentionSummary = {
  overdue: number;
  due_today: number;
  upcoming: number;
  undated: number;
  by_domain: Record<Domain, DomainCounts>;
};

export type AttentionItem = CareItem & {
  attention: AttentionState;
  days_until_due: number | null;
  /** "HH:mm" of next_due_at in the household time zone, for hourly items. */
  next_due_time?: string | null;
};

/** The current time and the household time zone, for hourly schedules. */
export type Clock = { now: string; timeZone: string };

export type HouseholdSettings = {
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  updated_at: string;
};

export type Dog = {
  id: string;
  name: string;
  breed: string | null;
  sex: Sex;
  birth_date: string | null;
  weight_kg: number | null;
  notes: string | null;
  archived_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type FamilyMember = {
  id: string;
  name: string;
  relationship: string | null;
  birth_date: string | null;
  notes: string | null;
  archived_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  odometer_km: number | null;
  notes: string | null;
  archived_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};
