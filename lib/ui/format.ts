import { daysUntil } from "@/lib/domain/dates";

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CATEGORY_LABELS: Record<string, string> = {
  vaccine: "Vacina",
  deworming: "Vermífugo",
  flea: "Antipulgas",
  vet: "Veterinário",
  weight: "Pesagem",
  grooming: "Banho e tosa",
  oil: "Óleo",
  service: "Revisão",
  inspection: "Vistoria",
  tire: "Pneus",
  cleaning: "Limpeza",
  deep_clean: "Limpeza pesada",
  repair: "Reparo",
  outdoor: "Área externa",
  filter: "Filtro",
  gas: "Gás",
  dog_food: "Ração",
  bill: "Conta",
  purchase: "Compra",
  dentist: "Dentista",
  medical: "Consulta",
  medicine: "Remédio",
  other: "Outro",
};

export function categoryLabel(slug: string): string {
  const known = CATEGORY_LABELS[slug];
  if (known) return known;
  const words = slug.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** 18000 -> "R$ 180,00". Built by hand so server and tests agree regardless of ICU data. */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${reais},${centavos}`;
}

export function formatKm(km: number): string {
  return `${km.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} km`;
}

export function formatKg(kg: number): string {
  return `${kg.toFixed(1).replace(".", ",")} kg`;
}

/** "2026-10-05" -> "5 out 2026" */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[(month ?? 1) - 1]} ${year}`;
}

/** "2026-10-05" -> { day: "05", month: "out" } for the timeline column. */
export function dayAndMonth(iso: string): { day: string; month: string } {
  const [, month, day] = iso.split("-");
  return { day: day ?? "", month: MONTHS_SHORT[Number(month) - 1] ?? "" };
}

export function daysAgoPhrase(iso: string, today: string): string {
  const days = -daysUntil(iso, today);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 60) return `há ${days} dias`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return months === 1 ? "há 1 mês" : `há ${months} meses`;
  const years = Math.floor(days / 365.25);
  return `há ${years} anos`;
}

/** Whole years and months between a birth date and today. */
export function agePhrase(birthDate: string, today: string): string {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = ((ty ?? 0) - (by ?? 0)) * 12 + ((tm ?? 0) - (bm ?? 0));
  if ((td ?? 0) < (bd ?? 0)) months -= 1;
  if (months < 0) return "—";
  if (months < 12) return months === 1 ? "1 mês" : `${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 ano" : `${years} anos`;
}

/** The category label, unless the title already says the same thing. */
export function categoryUnlessTitle(category: string, title: string): string | null {
  const label = categoryLabel(category);
  return label.toLocaleLowerCase("pt-BR") === title.trim().toLocaleLowerCase("pt-BR") ? null : label;
}
