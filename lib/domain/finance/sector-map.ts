import type { Domain } from "@/lib/domain/types";

/**
 * Default finance category for a care event's cost. The SQL backfill in
 * db/migrations/005_finance.sql repeats this table; tests/integration/finance-db.test.ts
 * checks both agree.
 */
export function sectorCategory(domain: Domain, category: string): string {
  switch (domain) {
    case "dog":
      if (["vaccine", "vet", "deworming", "flea"].includes(category)) return "pets_saude";
      if (category === "grooming") return "pets_banho";
      return "pets";
    case "car":
      if (["oil", "service", "tire", "inspection"].includes(category)) return "carro_manutencao";
      if (category === "fuel") return "combustivel";
      return "transporte";
    case "house":
      if (category === "cleaning" || category === "deep_clean") return "casa_limpeza";
      return "casa_manutencao";
    case "family":
      return category === "medicine" ? "saude_farmacia" : "saude_consulta";
    case "finance":
      if (category === "gas") return "gas";
      if (category === "dog_food") return "pets_racao";
      return "outros";
  }
}

/** Every (domain, category) pair worth checking against the SQL mapping. */
export const SECTOR_MAP_SAMPLES: ReadonlyArray<[Domain, string]> = [
  ["dog", "vaccine"], ["dog", "vet"], ["dog", "deworming"], ["dog", "flea"], ["dog", "grooming"], ["dog", "weight"],
  ["car", "oil"], ["car", "service"], ["car", "tire"], ["car", "inspection"], ["car", "fuel"], ["car", "other"],
  ["house", "cleaning"], ["house", "deep_clean"], ["house", "repair"],
  ["family", "medicine"], ["family", "dentist"],
  ["finance", "gas"], ["finance", "dog_food"], ["finance", "bill"], ["finance", "purchase"],
];
