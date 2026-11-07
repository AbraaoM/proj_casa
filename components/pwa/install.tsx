"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { installOffer, type InstallOffer } from "@/lib/ui/pwa";

const DISMISS_KEY = "casa-pwa-dismissed";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function isStandalone(): boolean {
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return ios || window.matchMedia("(display-mode: standalone)").matches;
}

function isIos(): boolean {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function useInstall(): { offer: (place: "banner" | "menu") => InstallOffer; install: () => Promise<void>; dismiss: () => void } {
  const [canPrompt, setCanPrompt] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const sync = () => {
      setCanPrompt(deferred !== null);
      setStandalone(isStandalone());
      setIos(isIos());
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferred = event as InstallPrompt;
      notify();
    };
    const onInstalled = () => {
      deferred = null;
      notify();
    };
    sync();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    listeners.add(sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      listeners.delete(sync);
    };
  }, []);

  return {
    offer: (place) => installOffer({ standalone, dismissed, canPrompt, ios, place }),
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      notify();
    },
    dismiss() {
      localStorage.setItem(DISMISS_KEY, "1");
      setDismissed(true);
    },
  };
}

const buttonClass =
  "inline-flex min-h-11 shrink-0 items-center rounded-md border border-black px-4 text-sm transition-colors duration-300 hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-white dark:hover:bg-white dark:hover:text-black";

/** Phone bar above the navigation. Hidden once the app is installed, or after "Agora não". */
export function InstallBanner() {
  const path = usePathname();
  const { offer, install, dismiss } = useInstall();
  const kind = offer("banner");
  if (path === "/mais" || kind === "none") return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-soft-white px-4 py-3 shadow-sm dark:border-line-dark dark:bg-soft-black md:hidden">
      <p className="min-w-0 flex-1 text-sm">
        {kind === "button" ? "Abra a Casa pela tela inicial, sem o navegador." : "No iPhone: Compartilhar, depois Adicionar à Tela de Início."}
      </p>
      {kind === "button" ? (
        <button type="button" className={buttonClass} onClick={() => void install()}>
          Instalar
        </button>
      ) : null}
      <button type="button" className="min-h-11 shrink-0 px-1 text-sm text-ink-muted" onClick={dismiss}>
        Agora não
      </button>
    </div>
  );
}

/** The same offer, kept on Mais so it stays findable after the banner is dismissed. */
export function InstallRow() {
  const { offer, install } = useInstall();
  const kind = offer("menu");
  if (kind === "none") return null;
  return (
    <div className="mt-8 border-t border-line pt-4 dark:border-line-dark">
      <p className="text-sm text-ink-muted">
        {kind === "button"
          ? "Instale a Casa no telefone. Ela abre em tela cheia, como um app."
          : "No iPhone, toque em Compartilhar e depois em Adicionar à Tela de Início."}
      </p>
      {kind === "button" ? (
        <button type="button" className={`${buttonClass} mt-3`} onClick={() => void install()}>
          Instalar
        </button>
      ) : null}
    </div>
  );
}
