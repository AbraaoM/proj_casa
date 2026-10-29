import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { finishGoogleConnect } from "@/lib/services/google-calendar";
import { requestOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

/** Google sends the browser back here. The session cookie travels with a top-level GET. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const url = new URL(request.url);
  const sql = tryGetSql();
  if (!sql) redirect("/agentes?agenda=failed");
  try {
    const origin = await requestOrigin();
    const done = await finishGoogleConnect(sql, {
      userId: user.id,
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      origin,
      denied: url.searchParams.has("error"),
    });
    if (!done.ok) redirect(`/agentes?agenda=${done.notice}`);
    revalidatePath("/agentes");
    revalidatePath("/agenda");
    revalidatePath("/");
    redirect("/agenda?agenda=connected");
  } catch (error) {
    unstable_rethrow(error);
    if (isMissingSchema(error)) redirect("/agentes?agenda=failed");
    console.error("google agenda callback failed");
    redirect("/agentes?agenda=failed");
  }
}
