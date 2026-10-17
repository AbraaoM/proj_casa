import type { ReactNode } from "react";
import { BottomBar, Sidebar, TopBar } from "@/components/nav/app-nav";
import type { AccountUser } from "@/lib/auth/types";

/** Logged-in frame: sidebar from md, top and bottom bars on the phone. */
export function AppShell({ user, children }: { user: AccountUser; children: ReactNode }) {
  return (
    <div className="min-h-full md:pl-20 lg:pl-60">
      <Sidebar username={user.username} />
      <TopBar />
      {/* Room for the bottom bar on the phone, so it never covers the last button. */}
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      <BottomBar />
    </div>
  );
}
