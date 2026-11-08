/**
 * Calories come from TACO (NEPA/UNICAMP, 4th edition), per 100 g.
 * A bare household name ("arroz", "ovo") picks the usual row. Anything more
 * specific has to match the table. The person never types a calorie number.
 * Piece weights are POF/IBGE household measures, only where one piece is obvious.
 */
import type { FoodUnit, IngredientDraft, StockDraft } from "@/lib/domain/food";
import { TACO_FOODS, type TacoRow } from "@/lib/domain/food/taco-table";

export type TacoMatch = { id: number; name: string; kcal_per_100: number; piece_grams: number | null };

/** Grams of one piece. Only foods a house counts one by one. */
const PIECE_GRAMS: Readonly<Record<number, number>> = {
  53: 50,
  182: 75,
  485: 10,
  488: 45,
  489: 45,
  490: 50,
};

const DEFAULTS: Readonly<Record<string, { stock: string; dish: string }>> = {
  arroz: { stock: "arroz tipo 1 cru", dish: "arroz tipo 1 cozido" },
  feijao: { stock: "feijao carioca cru", dish: "feijao carioca cozido" },
  ovo: { stock: "ovo galinha inteiro cru", dish: "ovo galinha inteiro cozido" },
  oleo: { stock: "oleo soja", dish: "oleo soja" },
  acucar: { stock: "acucar refinado", dish: "acucar refinado" },
  pao: { stock: "pao trigo frances", dish: "pao trigo frances" },
  batata: { stock: "batata inglesa crua", dish: "batata inglesa cozida" },
  frango: { stock: "frango peito sem pele cru", dish: "frango peito sem pele cozido" },
  cafe: { stock: "cafe po torrado", dish: "cafe infusao" },
};

const STOP = new Set(["de", "da", "do", "das", "dos", "com", "e", "a", "o", "em", "para", "sem", "ao", "aos", "um", "uma"]);

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return fold(value)
    .split(" ")
    .filter((word) => (word.length > 1 || /\d/.test(word)) && !STOP.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") && DEFAULTS[word.slice(0, -1)] ? word.slice(0, -1) : word));
}

function matchOf(row: TacoRow): TacoMatch {
  return { id: row.id, name: row.name, kcal_per_100: row.kcal, piece_grams: PIECE_GRAMS[row.id] ?? null };
}

export function tacoById(id: number): TacoMatch | null {
  const row = TACO_FOODS.find((food) => food.id === id);
  return row ? matchOf(row) : null;
}

function covers(row: TacoRow, queryWords: readonly string[]): boolean {
  const foodWords = tokens(row.name);
  return queryWords.every((word) => foodWords.includes(word));
}

function ranked(query: string): { row: TacoRow; score: number }[] {
  const queryWords = tokens(query);
  if (queryWords.length === 0) return [];
  const exact = fold(query);
  const scored = TACO_FOODS.flatMap((row) => {
    const name = fold(row.name);
    const foodWords = tokens(row.name);
    let score = 0;
    if (name === exact) score = 1000;
    else if (fold(row.base) === exact && queryWords.length === 1) score = 800;
    else if (covers(row, queryWords)) score = 600 - foodWords.filter((word) => !queryWords.includes(word)).length * 15;
    return score > 0 ? [{ row, score }] : [];
  });
  return scored.sort((a, b) => b.score - a.score || a.row.name.length - b.row.name.length || a.row.id - b.row.id);
}

function byPhrase(phrase: string): TacoRow | null {
  const queryWords = tokens(phrase);
  const hits = TACO_FOODS.filter((row) => covers(row, queryWords));
  if (hits.length === 0) return null;
  hits.sort((a, b) => tokens(a.name).length - tokens(b.name).length || a.id - b.id);
  const best = hits[0]!;
  const next = hits[1];
  if (next && tokens(next.name).length === tokens(best.name).length) return null;
  return best;
}

/** The row to use, or null when the name is ambiguous. Candidates are the closest rows. */
export function resolveTaco(query: string, where: "stock" | "dish"): { choice: TacoMatch | null; candidates: TacoMatch[] } {
  const found = ranked(query);
  const candidates = found.slice(0, 5).map((hit) => matchOf(hit.row));
  const top = found[0];
  if (!top) return { choice: null, candidates: [] };
  if (top.score >= 1000 || found.length === 1) return { choice: matchOf(top.row), candidates };
  const key = tokens(query);
  const usual = key.length === 1 ? DEFAULTS[key[0]!] : undefined;
  if (usual) {
    const row = byPhrase(where === "stock" ? usual.stock : usual.dish);
    if (row) return { choice: matchOf(row), candidates };
  }
  const second = found[1];
  if (top.score >= 600 && (!second || top.score - second.score >= 30)) return { choice: matchOf(top.row), candidates };
  return { choice: null, candidates };
}

export function searchTaco(query: string, limit = 5): TacoMatch[] {
  const size = Math.min(Math.max(limit, 1), 10);
  return ranked(query).slice(0, size).map((hit) => matchOf(hit.row));
}

/** Fills kcal from TACO when the draft did not bring a number. A stated number wins. */
export function applyTacoToStock(draft: StockDraft): StockDraft {
  if (draft.kcal_per_100 !== null || draft.kcal_each !== null) return draft;
  const food = draft.taco_id !== null ? tacoById(draft.taco_id) : resolveTaco(draft.name, "stock").choice;
  if (!food) return { ...draft, taco_id: null };
  if (draft.unit === "un") {
    if (food.piece_grams === null) return { ...draft, taco_id: food.id };
    return { ...draft, taco_id: food.id, kcal_each: Math.round((food.kcal_per_100 * food.piece_grams) / 100) };
  }
  return { ...draft, taco_id: food.id, kcal_per_100: food.kcal_per_100 };
}

/** Ingredient calories from a stated number, or from TACO for what was cooked. */
export function tacoIngredientKcal(line: IngredientDraft): { kcal: number | null; taco_id: number | null } {
  if (line.kcal !== null) return { kcal: line.kcal, taco_id: line.taco_id };
  const food = line.taco_id !== null ? tacoById(line.taco_id) : resolveTaco(line.name ?? "", "dish").choice;
  if (!food) return { kcal: null, taco_id: null };
  if (line.unit === "un") {
    if (food.piece_grams === null) return { kcal: null, taco_id: food.id };
    const grams = (food.piece_grams * line.quantity_milli) / 1000;
    return { kcal: Math.round((food.kcal_per_100 * grams) / 100), taco_id: food.id };
  }
  return { kcal: Math.round((food.kcal_per_100 * line.quantity_milli) / 100_000), taco_id: food.id };
}

export function tacoKcalFor(unit: FoodUnit, food: TacoMatch, quantityMilli: number): number | null {
  if (unit === "un") {
    if (food.piece_grams === null) return null;
    return Math.round((food.kcal_per_100 * food.piece_grams * quantityMilli) / 100_000);
  }
  return Math.round((food.kcal_per_100 * quantityMilli) / 100_000);
}
