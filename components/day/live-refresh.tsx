"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reloads the server page while this tab is open, so the day fills in as people record things. */
export function LiveRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
