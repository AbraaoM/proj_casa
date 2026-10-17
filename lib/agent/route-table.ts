/**
 * Every /api/agent route and its methods. The proxy answers unknown paths (404) and
 * wrong methods (405) in JSON from this table, instead of Next's empty or HTML pages.
 * A test keeps it equal to the route.ts files.
 */
export const AGENT_ROUTES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["areas", ["GET", "POST"]],
  ["areas/[id]", ["GET", "PATCH"]],
  ["areas/[id]/history", ["GET"]],
  ["areas/bulk", ["POST"]],
  ["attention", ["GET"]],
  ["dogs", ["GET", "POST"]],
  ["dogs/[id]", ["GET", "PATCH"]],
  ["dogs/[id]/history", ["GET"]],
  ["events", ["GET", "POST"]],
  ["events/[id]", ["GET", "PATCH"]],
  ["events/bulk", ["POST"]],
  ["family", ["GET", "POST"]],
  ["family/[id]", ["GET", "PATCH"]],
  ["family/[id]/history", ["GET"]],
  ["finance/accounts", ["GET", "POST"]],
  ["finance/accounts/[id]", ["GET", "PATCH"]],
  ["finance/accounts/[id]/balance-checks", ["POST"]],
  ["finance/accounts/[id]/reconcile", ["POST"]],
  ["finance/accounts/bulk", ["POST"]],
  ["finance/bills", ["GET", "POST"]],
  ["finance/bills/[id]", ["GET", "PATCH"]],
  ["finance/bills/[id]/pay", ["POST"]],
  ["finance/bills/bulk", ["POST"]],
  ["finance/budgets", ["GET", "PUT"]],
  ["finance/categories", ["GET", "POST"]],
  ["finance/categories/[id]", ["GET", "PATCH"]],
  ["finance/summary", ["GET"]],
  ["finance/transactions", ["GET", "POST"]],
  ["finance/transactions/[id]", ["GET", "PATCH"]],
  ["finance/transactions/bulk", ["POST"]],
  ["health", ["GET"]],
  ["items", ["GET", "POST"]],
  ["items/[id]", ["GET", "PATCH"]],
  ["items/[id]/done", ["POST"]],
  ["items/[id]/doses", ["GET", "POST"]],
  ["items/bulk", ["POST"]],
  ["settings", ["GET", "PATCH"]],
  ["vehicles", ["GET", "POST"]],
  ["vehicles/[id]", ["GET", "PATCH"]],
  ["vehicles/[id]/history", ["GET"]],
  ["weather", ["GET"]],
];

export type AgentRouteCheck =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "method_not_allowed"; allow: string[] };

/** Like Next: a static segment wins over [id]. HEAD follows GET; OPTIONS is always fine. */
export function checkAgentRoute(pathname: string, method: string): AgentRouteCheck {
  if (pathname !== "/api/agent" && !pathname.startsWith("/api/agent/")) return { kind: "ok" };
  const parts = pathname.slice("/api/agent/".length).replace(/\/+$/, "").split("/").filter(Boolean);
  let best: { methods: readonly string[]; dynamic: number } | null = null;
  for (const [pattern, methods] of AGENT_ROUTES) {
    const segments = pattern.split("/");
    if (segments.length !== parts.length) continue;
    let dynamic = 0;
    const fits = segments.every((segment, index) => {
      if (segment === "[id]") {
        dynamic += 1;
        return true;
      }
      return segment === parts[index];
    });
    if (fits && (!best || dynamic < best.dynamic)) best = { methods, dynamic };
  }
  if (!best) return { kind: "not_found" };
  const upper = method.toUpperCase();
  if (upper === "OPTIONS" || best.methods.includes(upper) || (upper === "HEAD" && best.methods.includes("GET"))) return { kind: "ok" };
  return { kind: "method_not_allowed", allow: [...best.methods] };
}
