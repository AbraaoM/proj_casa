/**
 * What the proxy does with a request, kept pure so it is tested without Next.
 * The agent API answers for itself (bearer key), so it always passes.
 * "/" is public: the page itself shows the landing when there is no valid session.
 */

const PUBLIC_PATHS = new Set(["/", "/login", "/manifest.webmanifest"]);

export type ProxyDecision = "pass" | "login";

export function proxyDecision(pathname: string, hasSessionCookie: boolean): ProxyDecision {
  if (pathname.startsWith("/api/agent")) return "pass";
  if (PUBLIC_PATHS.has(pathname)) return "pass";
  return hasSessionCookie ? "pass" : "login";
}
