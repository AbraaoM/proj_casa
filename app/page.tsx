import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { Landing } from "@/components/landing/landing";
import { AppShell } from "@/components/nav/app-shell";
import { currentUser } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

/**
 * "/" depends on the session. No cookie, an unknown token or an expired session
 * all give `null` here, and then only the static landing renders: the dashboard
 * data is never loaded.
 */
export default async function HomePage() {
  const user = await currentUser();
  if (!user) return <Landing />;
  const data = await loadDashboard();
  return (
    <AppShell user={user}>
      <HomeDashboard data={data} />
    </AppShell>
  );
}
