import { changeOwnPasswordAction, createUserAction, setPasswordAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSql } from "@/lib/db/client";
import { listUsers } from "@/lib/repositories/accounts";
import { CreateUserForm, OwnPasswordForm, SetPasswordForm } from "@/components/auth/auth-forms";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  const users = await listUsers(getSql());
  const others = users.filter((user) => user.id !== actor.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-3xl leading-tight tracking-tight">Usuários</h1>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        Qualquer conta pode criar usuários e definir a senha de outra conta. Não há recuperação de senha.
      </p>

      <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Sua senha</h2>
        <OwnPasswordForm action={changeOwnPasswordAction} />
      </section>

      <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Novo usuário</h2>
        <CreateUserForm action={createUserAction} />
      </section>

      <section className="mt-12 border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Contas</h2>
        <ul className="mt-4">
          {users.map((user) => (
            <li key={user.id} className="border-b border-line py-5 dark:border-line-dark">
              <p className="text-base">
                {user.username}
                {user.role === "admin" ? <span className="text-ink-muted"> · master</span> : null}
                {user.id === actor.id ? <span className="text-ink-muted"> · você</span> : null}
              </p>
              {user.id === actor.id ? (
                <p className="mt-2 text-sm text-ink-muted">A sua senha muda no formulário acima.</p>
              ) : (
                <div className="max-w-md">
                  <SetPasswordForm action={setPasswordAction} userId={user.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {others.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Nenhuma outra conta.</p>
        ) : null}
      </section>
    </main>
  );
}
