/** Where each page lives in the navigation. Pure, so it is tested without a browser. */

export type NavKey = "painel" | "familia" | "casa" | "financas" | "caes" | "carros" | "agenda" | "agentes" | "usuarios" | "mais";

export type NavEntry = { key: NavKey; href: string; label: string };

/** Sectors in the desktop sidebar, in order. */
export const SECTORS: NavEntry[] = [
  { key: "painel", href: "/", label: "Painel" },
  { key: "familia", href: "/familia", label: "Família" },
  { key: "casa", href: "/casa", label: "Casa" },
  { key: "financas", href: "/financas", label: "Finanças" },
  { key: "caes", href: "/caes", label: "Cães" },
  { key: "carros", href: "/carros", label: "Carros" },
  { key: "agenda", href: "/agenda", label: "Agenda" },
];

/** Account links at the bottom of the sidebar and on /mais. */
export const ACCOUNT: NavEntry[] = [
  { key: "agentes", href: "/agentes", label: "Agentes" },
  { key: "usuarios", href: "/usuarios", label: "Usuários" },
];

/** The phone bar: four sectors and "Mais". */
export const BOTTOM_BAR: NavEntry[] = [
  ...SECTORS.slice(0, 4),
  { key: "mais", href: "/mais", label: "Mais" },
];

/** What lives behind "Mais" on the phone. */
export const MORE_ENTRIES: NavEntry[] = [...SECTORS.slice(4), ...ACCOUNT];

function within(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The sidebar entry for a path (the panel only on "/"). */
export function activeSector(pathname: string): NavKey | null {
  return [...SECTORS, ...ACCOUNT].find((entry) => within(pathname, entry.href))?.key ?? (within(pathname, "/mais") ? "mais" : null);
}

/** The phone bar entry for a path: pages behind "Mais" light up "Mais". */
export function activeBottom(pathname: string): NavKey | null {
  const key = activeSector(pathname);
  if (key === null) return null;
  return BOTTOM_BAR.some((entry) => entry.key === key) ? key : "mais";
}
