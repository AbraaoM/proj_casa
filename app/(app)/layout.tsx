import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <AppHeader user={user} />
      {children}
    </>
  );
}
