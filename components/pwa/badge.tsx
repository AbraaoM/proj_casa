"use client";

import { useEffect } from "react";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function installedApp(): boolean {
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return ios || window.matchMedia("(display-mode: standalone)").matches;
}

/** Puts the number of things that need a touch on the installed icon. Leaves the browser icon alone. */
export function AppBadge({ count }: { count: number | null }) {
  useEffect(() => {
    if (count === null || !installedApp()) return;
    const nav = navigator as BadgeNavigator;
    const write = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    void write?.catch(() => {});
  }, [count]);
  return null;
}