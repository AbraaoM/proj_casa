import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The agent API contract: every route file and its HTTP methods. A change here must be on purpose. */
const EXPECTED = [
  "areas GET POST",
  "areas/[id] GET PATCH",
  "areas/[id]/history GET",
  "areas/bulk POST",
  "attention GET",
  "dogs GET POST",
  "dogs/[id] GET PATCH",
  "dogs/[id]/history GET",
  "events GET POST",
  "events/[id] GET PATCH",
  "events/bulk POST",
  "family GET POST",
  "family/[id] GET PATCH",
  "family/[id]/history GET",
  "finance/accounts GET POST",
  "finance/accounts/[id] GET PATCH",
  "finance/accounts/[id]/balance-checks POST",
  "finance/accounts/[id]/reconcile POST",
  "finance/accounts/bulk POST",
  "finance/bills GET POST",
  "finance/bills/[id] GET PATCH",
  "finance/bills/[id]/pay POST",
  "finance/budgets GET PUT",
  "finance/categories GET POST",
  "finance/categories/[id] GET PATCH",
  "finance/summary GET",
  "finance/transactions GET POST",
  "finance/transactions/[id] GET PATCH",
  "finance/transactions/bulk POST",
  "health GET",
  "items GET POST",
  "items/[id] GET PATCH",
  "items/[id]/done POST",
  "items/[id]/doses GET POST",
  "items/bulk POST",
  "settings GET PATCH",
  "vehicles GET POST",
  "vehicles/[id] GET PATCH",
  "vehicles/[id]/history GET",
  "weather GET",
];

const ROOT = path.join(import.meta.dirname, "../../app/api/agent");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("/api/agent routes", () => {
  it("keep the same files and methods", () => {
    const actual = routeFiles(ROOT)
      .map((file) => {
        const route = path.relative(ROOT, path.dirname(file)).split(path.sep).join("/");
        const methods = [...readFileSync(file, "utf8").matchAll(/^export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE)\b/gm)]
          .map((match) => match[1])
          .sort((a, b) => ["GET", "POST", "PUT", "PATCH", "DELETE"].indexOf(a!) - ["GET", "POST", "PUT", "PATCH", "DELETE"].indexOf(b!));
        return `${route} ${methods.join(" ")}`;
      })
      .sort();
    expect(actual).toEqual([...EXPECTED].sort());
  });

  it("are not behind the login redirect", async () => {
    const { proxyDecision } = await import("@/lib/auth/routes");
    for (const entry of EXPECTED) expect(proxyDecision(`/api/agent/${entry.split(" ")[0]}`, false)).toBe("pass");
  });
});
