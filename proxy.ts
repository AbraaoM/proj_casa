import { NextResponse, type NextRequest } from "next/server";
import { checkAgentRoute } from "@/lib/agent/route-table";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { proxyDecision } from "@/lib/auth/routes";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/agent" || pathname.startsWith("/api/agent/")) return agentRoute(pathname, request.method);

  const decision = proxyDecision(pathname, request.cookies.has(SESSION_COOKIE));
  if (decision === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

/** The agent API always answers JSON, also for a path or a method that does not exist. */
function agentRoute(pathname: string, method: string) {
  const check = checkAgentRoute(pathname, method);
  if (check.kind === "not_found") {
    return NextResponse.json({ ok: false, error: { code: "not_found", message: `No agent route at ${pathname}.` } }, { status: 404 });
  }
  if (check.kind === "method_not_allowed") {
    return NextResponse.json(
      { ok: false, error: { code: "method_not_allowed", message: `${method} is not allowed here. Use ${check.allow.join(", ")}.` } },
      { status: 405, headers: { Allow: check.allow.join(", ") } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
