/** What the phone should offer. Pure, so it is tested without a browser. */

export type InstallPlace = "banner" | "menu";
export type InstallOffer = "button" | "ios" | "none";

/**
 * Android/Chrome can install from a button once the browser asks.
 * iOS has no install event: the menu explains Compartilhar → Adicionar à Tela de Início.
 * The banner can be dismissed; the menu (Mais) keeps the offer. An installed app shows nothing.
 */
export function installOffer(input: {
  standalone: boolean;
  dismissed: boolean;
  canPrompt: boolean;
  ios: boolean;
  place: InstallPlace;
}): InstallOffer {
  if (input.standalone) return "none";
  if (input.place === "banner" && input.dismissed) return "none";
  if (input.canPrompt) return "button";
  if (input.ios) return "ios";
  return "none";
}

/**
 * Long-press on the installed icon. Android shows four.
 * The icon itself already opens the panel, so these are the other doors.
 */
export const APP_SHORTCUTS = [
  { name: "Casa", short_name: "Casa", description: "Checklist da casa", url: "/casa" },
  { name: "Hoje", short_name: "Hoje", description: "Quem fez o quê hoje", url: "/hoje" },
  { name: "Finanças", short_name: "Finanças", description: "Contas e gastos", url: "/financas" },
  { name: "Agenda", short_name: "Agenda", description: "Compromissos da casa", url: "/agenda" },
] as const;
