import { changeOwnPasswordAction, createUserAction, setPasswordAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { canManageAccounts } from "@/lib/auth/policy";
import { getSystemSql } from "@/lib/db/client";
import { listFamilyUsers } from "@/lib/repositories/accounts";
import { tryGetSql } from "@/lib/db/client";
import { listInvites } from "@/lib/repositories/invites";
import { CreateUserForm, OwnPasswordForm, SetPasswordForm } from "@/components/auth/auth-forms";
import { InviteManager } from "@/components/auth/invite-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.family) redirect("/login");
  const users = await listFamilyUsers(getSystemSql(), actor.family.familyId);
  const others = users.filter((user) => user.id !== actor.id);
  const master = canManageAccounts(actor);
  const sql = master ? tryGetSql() : null;
  const invites = sql ? await listInvites(sql).catch(() => []) : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-3xl leading-tight tracking-tight">Usuários</h1>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        Cada pessoa troca só a própria senha. A conta master cria contas e redefine a senha de outra pessoa, que escolhe uma nova no próximo acesso. Não há recuperação de senha.
      </p>

      <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Sua senha</h2>
        <OwnPasswordForm action={changeOwnPasswordAction} />
      </section>

      {master ? (
        <section className="mt-12 max-w-xl border-t border-line pt-4 dark:border-line-dark">
          <h2 className="text-lg">Convidar por link</h2>
          <p className="mt-2 text-sm text-ink-muted">
            A pessoa abre o link, escolhe o próprio usuário e a própria senha e entra na família de {actor.family.familyName}. Cada link vale para uma pessoa e por 7 dias.
          </p>
          <InviteManager invites={invites.map((invite) => ({ id: invite.id, status: invite.status, expiresAt: invite.expiresAt, createdAt: invite.createdAt }))} />
        </section>
      ) : null}

      {master ? (
        <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
          <h2 className="text-lg">Novo usuário</h2>
          <CreateUserForm action={createUserAction} />
        </section>
      ) : null}

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
              ) : !master ? null : (
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
