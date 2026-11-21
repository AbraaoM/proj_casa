/**
 * What the proxy does with a request, kept pure so it is tested without Next.
 * The agent API answers for itself (bearer key), so it always passes.
 * "/" is public: the page itself shows the landing when there is no valid session.
 */

const PUBLIC_PATHS = new Set(["/", "/login", "/cadastrar", "/privacidade", "/termos", "/manifest.webmanifest", "/sw.js", "/offline.html", "/robots.txt", "/sitemap.xml", "/opengraph-image"]);

export type ProxyDecision = "pass" | "login";

export function proxyDecision(pathname: string, hasSessionCookie: boolean): ProxyDecision {
  if (pathname.startsWith("/api/agent")) return "pass";
  // The MCP endpoint checks its own bearer key.
  if (pathname === "/api/mcp") return "pass";
  // Telegram (secret header) and Vercel Cron call these without a session.
  if (pathname === "/api/telegram/webhook" || pathname.startsWith("/api/telegram/webhook/") || pathname === "/api/telegram/digest" || pathname === "/api/telegram/report") return "pass";
  if (PUBLIC_PATHS.has(pathname)) return "pass";
  // An invitation link: the person has no account yet.
  if (pathname.startsWith("/convite/")) return "pass";
  return hasSessionCookie ? "pass" : "login";
}
