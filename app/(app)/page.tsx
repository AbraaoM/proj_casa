import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { loadDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await loadDashboard();
  return <HomeDashboard data={data} />;
}
