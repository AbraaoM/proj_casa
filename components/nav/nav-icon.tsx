import { Bot, CalendarDays, Car, Dog, House, LayoutGrid, ListChecks, Menu, UserCog, Users, Wallet, type LucideIcon } from "lucide-react";
import type { NavKey } from "@/lib/ui/nav";

export const NAV_ICONS: Record<NavKey, LucideIcon> = {
  painel: LayoutGrid,
  familia: Users,
  casa: House,
  financas: Wallet,
  caes: Dog,
  carros: Car,
  agenda: CalendarDays,
  hoje: ListChecks,
  agentes: Bot,
  usuarios: UserCog,
  mais: Menu,
};
