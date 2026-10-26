/**
 * The suggested frequencies (the owner approved them as the starting point). Agents propose
 * them when a room has no routine yet; the person changes any of them later only by asking
 * an agent (atualizar_item). The app has no screen to edit a frequency.
 */
export type KitEntry = {
  /** Which rooms it fits, matched against the area slug or name. */
  fits: string;
  title: string;
  category: "cleaning" | "deep_clean" | "maintenance" | "general";
  interval_days?: number;
  interval_months?: number;
};

export const ROUTINE_KIT: readonly KitEntry[] = [
  { fits: "banheiro", title: "Limpeza do banheiro", category: "cleaning", interval_days: 3 },
  { fits: "banheiro", title: "Limpeza pesada do banheiro", category: "deep_clean", interval_days: 15 },
  { fits: "banheiro", title: "Trocar toalhas", category: "cleaning", interval_days: 3 },
  { fits: "quarto", title: "Trocar roupa de cama", category: "cleaning", interval_days: 7 },
  { fits: "cozinha", title: "Limpar bancada e fogão", category: "cleaning", interval_days: 1 },
  { fits: "cozinha", title: "Limpar a geladeira", category: "deep_clean", interval_days: 30 },
  { fits: "cozinha", title: "Trocar filtro de água", category: "maintenance", interval_months: 6 },
  { fits: "qualquer cômodo", title: "Aspirar e passar pano", category: "cleaning", interval_days: 7 },
  { fits: "ar-condicionado", title: "Limpar filtro do ar-condicionado", category: "maintenance", interval_months: 1 },
];

/** external_key convention for routines, so a repeated setup does not duplicate. */
export function routineKey(areaSlug: string, task: string): string {
  const slug = task
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  return `rotina:${areaSlug}:${slug}`;
}
