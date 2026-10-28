import { redirect, unstable_rethrow } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { isGoogleAuthUrl } from "@/lib/domain/calendar";
import { beginGoogleConnect } from "@/lib/services/google-calendar";
import { requestOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

/** One tap from Agentes. The browser comes back to /api/google/callback with the session cookie. */
export async function GET() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const sql = tryGetSql();
  if (!sql) redirect("/agentes?agenda=failed");
  try {
    const origin = await requestOrigin();
    const started = await beginGoogleConnect(sql, user.id, origin);
    if (!started.ok) redirect(`/agentes?agenda=${started.notice}`);
    if (!isGoogleAuthUrl(started.url)) redirect("/agentes?agenda=failed");
    redirect(started.url);
  } catch (error) {
    unstable_rethrow(error);
    if (isMissingSchema(error)) redirect("/agentes?agenda=failed");
    console.error("google agenda start failed");
    redirect("/agentes?agenda=failed");
  }
}
