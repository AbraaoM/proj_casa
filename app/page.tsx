import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { Landing } from "@/components/landing/landing";
import { AppShell } from "@/components/nav/app-shell";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { currentUser } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

/**
 * "/" depends on the session. No cookie, an unknown token or an expired session
 * all give `null` here, and then only the static landing renders: the dashboard
 * data is never loaded. With a session, the shell shows at once and the
 * dashboard streams in behind a skeleton.
 */
export default async function HomePage() {
  const user = await currentUser();
  if (!user) return <Landing />;
  if (user.mustChangePassword) redirect("/trocar-senha");
  return (
    <AppShell user={user}>
      <Suspense fallback={<PageSkeleton />}>
        <Dashboard />
      </Suspense>
    </AppShell>
  );
}

async function Dashboard() {
  const data = await loadDashboard();
  return <HomeDashboard data={data} />;
}
