import { logoutAction } from "@/lib/auth/actions";
import { PublicFrame } from "@/components/auth/public-frame";

/** Shown instead of the app when the 14-day trial has ended. The data stays, writes are blocked. */
export function TrialExpired({ familyName, canManage }: { familyName: string; canManage: boolean }) {
  return (
    <PublicFrame backLabel="Conhecer o app">
      <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">O teste de 14 dias terminou</h1>
      <p className="mt-3 text-sm text-ink-muted">
        A família <strong className="text-black dark:text-white">{familyName}</strong> continua guardada, mas ficou só para consulta: ninguém consegue cadastrar ou alterar nada agora.
      </p>
      <p className="mt-3 text-sm text-ink-muted">
        {canManage
          ? "Ainda não há plano pago. Quando houver, você poderá continuar por aqui. Nada foi cobrado e nada foi apagado."
          : "Fale com quem criou a família. Nada foi cobrado e nada foi apagado."}
      </p>
      <form action={logoutAction} className="mt-8">
        <button
          type="submit"
          className="min-h-11 rounded-md border border-line px-4 py-3 text-sm font-medium transition-colors duration-300 hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:border-white"
        >
          Sair
        </button>
      </form>
    </PublicFrame>
  );
}
