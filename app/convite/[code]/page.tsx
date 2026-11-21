import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInviteAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { tryGetSystemSql } from "@/lib/db/client";
import { findInviteByCode, type InviteLookup } from "@/lib/repositories/invites";
import { JoinForm } from "@/components/auth/auth-forms";
import { PublicFrame } from "@/components/auth/public-frame";

export const dynamic = "force-dynamic";

// A link that carries a secret must not be indexed or leak through the referrer.
export const metadata: Metadata = {
  title: "Convite para uma família",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (await currentUser()) redirect("/");
  const invite = await lookup(code);
  const open = invite?.found === true && invite.status === "open";

  return (
    <PublicFrame>
      {open ? (
        <>
          <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Você foi convidado</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Crie a sua conta para entrar na família <strong className="text-black dark:text-white">{invite.familyName}</strong>. O convite vale para uma pessoa só.
          </p>
          <div className="mt-8">
            <JoinForm action={acceptInviteAction} code={code} />
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Este convite não vale mais</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Ele já foi usado, foi cancelado ou venceu. Peça um convite novo a quem te chamou.
          </p>
          <p className="mt-6 text-sm text-ink-muted">
            Já tem conta?{" "}
            <Link href="/login" className="underline underline-offset-2">
              Entrar
            </Link>
          </p>
        </>
      )}
    </PublicFrame>
  );
}

async function lookup(code: string): Promise<InviteLookup | null> {
  const sql = tryGetSystemSql();
  if (!sql) return null;
  try {
    return await findInviteByCode(sql, code);
  } catch {
    return null;
  }
}
