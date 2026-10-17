import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { proxyDecision } from "@/lib/auth/routes";

export function proxy(request: NextRequest) {
  const decision = proxyDecision(request.nextUrl.pathname, request.cookies.has(SESSION_COOKIE));
  if (decision === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
