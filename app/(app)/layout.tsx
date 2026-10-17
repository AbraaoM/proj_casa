import { redirect } from "next/navigation";
import { AppShell } from "@/components/nav/app-shell";
import { currentUser } from "@/lib/auth/session";
import { requestSettings } from "@/lib/services/subject-pages";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Warm the settings in parallel with the session; the page reuses them (errors surface there).
  requestSettings().catch(() => null);
  const user = await currentUser();
  if (!user) redirect("/login");
  return <AppShell user={user}>{children}</AppShell>;
}
