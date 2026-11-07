import type { MetadataRoute } from "next";
import { APP_SHORTCUTS } from "@/lib/ui/pwa";

const SHORTCUT_ICON = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Casa",
    short_name: "Casa",
    description: "O que pede atenção em casa.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#10b981",
    lang: "pt-BR",
    launch_handler: { client_mode: "navigate-existing" },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: APP_SHORTCUTS.map((shortcut) => ({ ...shortcut, icons: SHORTCUT_ICON })),
  };
}