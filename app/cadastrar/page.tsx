import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { SignUpForm } from "@/components/auth/auth-forms";
import { PublicFrame } from "@/components/auth/public-frame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Criar minha família",
  description: "Crie a conta e a sua família. 14 dias grátis, sem cartão.",
  alternates: { canonical: "/cadastrar" },
  robots: { index: true, follow: true },
};

export default async function SignUpPage() {
  if (await currentUser()) redirect("/");
  return (
    <PublicFrame>
      <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Criar minha família</h1>
      <p className="mt-3 text-sm text-ink-muted">
        Você cria a conta e a família juntas. São 14 dias grátis, sem cartão. Depois você convida as outras pessoas da casa por um link.
      </p>
      <div className="mt-8">
        <SignUpForm action={signUpAction} />
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        Já tem conta?{" "}
        <Link href="/login" className="underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </PublicFrame>
  );
}
