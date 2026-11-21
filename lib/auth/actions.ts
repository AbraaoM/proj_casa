"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/dates";
import { canManageAccounts, canResetPassword, firstRunMode, isPublicDeploy, MAX_FAMILIES } from "@/lib/auth/policy";
import { tryGetSql, tryGetSystemSql } from "@/lib/db/client";
import { isMissingSchema, isUniqueViolation } from "@/lib/db/errors";
import {
  acceptInvite,
  countFamilies,
  createFamilyWithOwner,
  deleteOtherSessions,
  deleteSession,
  deleteUserSessions,
  findUserByPassword,
  findUserByUsername,
  insertFamilyUser,
  insertFirstUser,
  insertSession,
  updateFamilyUserPassword,
  updateOwnPassword,
} from "@/lib/repositories/accounts";
import { createInvite, findInviteByCode, revokeInvite } from "@/lib/repositories/invites";
import { AppError } from "@/lib/errors";
import { requestOrigin } from "@/lib/http/origin";
import { clearSessionCookie, currentUser, readSessionToken, setSessionCookie } from "@/lib/auth/session";
import { hashSessionToken, newSessionToken } from "@/lib/auth/token";
import type { FormState } from "@/lib/auth/types";
import { parseFamilyName, parseLogin, parsePassword, parsePasswordPair, parseUsername } from "@/lib/auth/validate";

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseLogin(formData.get("username"), formData.get("password"));
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const sql = tryGetSystemSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const user = await findUserByPassword(sql, parsed.value.username, parsed.value.password);
    if (!user) return { ok: false, message: "Usuário ou senha inválidos." };
    if (!user.family) return { ok: false, message: "Esta conta não está ligada a nenhuma família. Fale com quem administra o Ametista." };
    if (user.passwordIsDefault && isPublicDeploy()) {
      return {
        ok: false,
        message: "Esta conta ainda usa a senha inicial. Troque a senha no app local antes de entrar por aqui.",
      };
    }
    const token = newSessionToken();
    await insertSession(sql, user.id, hashSessionToken(token));
    await setSessionCookie(token);
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("login failed");
    return { ok: false, message: "Não consegui entrar agora." };
  }

  redirect("/");
}

/** First run: creates the first account (master) with the password the person chose. */
export async function setupFirstAccountAction(_state: FormState, formData: FormData): Promise<FormState> {
  if (firstRunMode() !== "form") {
    return { ok: false, message: "Aqui a primeira conta é criada pelo npm run db:migrate. Veja o README." };
  }
  const username = parseUsername(formData.get("username"));
  if (!username.ok) return { ok: false, message: username.message };
  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };

  const sql = tryGetSystemSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };
  try {
    const user = await insertFirstUser(sql, username.value, password.value);
    if (!user) return { ok: false, message: "A primeira conta já existe. Entre com ela." };
    const token = newSessionToken();
    await insertSession(sql, user.id, hashSessionToken(token));
    await setSessionCookie(token);
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("first account failed");
    return { ok: false, message: "Não consegui criar a conta." };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  const sql = tryGetSystemSql();
  if (token && sql) {
    try {
      await deleteSession(sql, hashSessionToken(token));
    } catch (error) {
      console.error("logout failed", error instanceof Error ? error.name : "error");
    }
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function changeOwnPasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");

  const current = parsePassword(formData.get("current_password"));
  if (!current.ok) return { ok: false, message: current.message };
  const next = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!next.ok) return { ok: false, message: next.message };

  const token = await readSessionToken();
  const sql = tryGetSystemSql();
  if (!token || !sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const changed = await updateOwnPassword(sql, actor.id, next.value, current.value);
    if (!changed) return { ok: false, message: "A senha atual não confere." };
    await deleteOtherSessions(sql, actor.id, hashSessionToken(token));
    revalidatePath("/", "layout");
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("password change failed");
    return { ok: false, message: "Não consegui alterar a senha." };
  }
  if (actor.mustChangePassword) redirect("/");
  return { ok: true, message: "Senha alterada." };
}

export async function createUserAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canManageAccounts(actor) || !actor.family) return { ok: false, message: "Só quem é dono da família cria usuários." };

  const username = parseUsername(formData.get("username"));
  if (!username.ok) return { ok: false, message: username.message };
  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };

  const sql = tryGetSystemSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const existing = await findUserByUsername(sql, username.value);
    if (existing) return { ok: false, message: "Esse usuário já existe." };
    await insertFamilyUser(sql, actor.family.familyId, username.value, password.value);
    revalidatePath("/usuarios");
    return { ok: true, message: "Usuário criado." };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Esse usuário já existe." };
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("create user failed");
    return { ok: false, message: "Não consegui criar o usuário." };
  }
}

export async function setPasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");

  const userId = String(formData.get("user_id") ?? "");
  if (!isUuid(userId)) return { ok: false, message: "Usuário não encontrado." };
  if (userId === actor.id) return { ok: false, message: "Use o formulário da sua senha." };
  if (!canResetPassword(actor, userId) || !actor.family) return { ok: false, message: "Só quem é dono da família redefine a senha de outra pessoa." };

  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };

  const sql = tryGetSystemSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const changed = await updateFamilyUserPassword(sql, actor.family.familyId, userId, password.value);
    if (!changed) return { ok: false, message: "Usuário não encontrado." };
    await deleteUserSessions(sql, userId);
    revalidatePath("/usuarios");
    return { ok: true, message: "Senha redefinida. A pessoa escolhe uma nova no próximo acesso." };
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("set password failed");
    return { ok: false, message: "Não consegui alterar a senha." };
  }
}

/** Public sign-up: the person creates their account and their own family, with 14 days of trial. */
export async function signUpAction(_state: FormState, formData: FormData): Promise<FormState> {
  // A hidden field only bots fill in.
  if (String(formData.get("website") ?? "") !== "") return { ok: false, message: "Não consegui criar a conta." };
  const familyName = parseFamilyName(formData.get("family_name"));
  if (!familyName.ok) return { ok: false, message: familyName.message };
  const username = parseUsername(formData.get("username"));
  if (!username.ok) return { ok: false, message: username.message };
  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };
  if (formData.get("terms") !== "on") return { ok: false, message: "Marque que leu os termos e a privacidade para continuar." };

  const sql = tryGetSystemSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };
  try {
    if ((await countFamilies(sql)) >= MAX_FAMILIES) {
      return { ok: false, message: "Os cadastros novos estão pausados por enquanto. Tente de novo mais tarde." };
    }
    if (await findUserByUsername(sql, username.value)) return { ok: false, message: "Esse usuário já existe. Escolha outro." };
    const user = await createFamilyWithOwner(sql, { familyName: familyName.value, username: username.value, password: password.value });
    const token = newSessionToken();
    await insertSession(sql, user.id, hashSessionToken(token));
    await setSessionCookie(token);
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Esse usuário já existe. Escolha outro." };
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("sign-up failed");
    return { ok: false, message: "Não consegui criar a conta agora." };
  }
  redirect("/");
}

/** Joins a family with an invitation link: creates the account as a member and spends the invite. */
export async function acceptInviteAction(_state: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get("website") ?? "") !== "") return { ok: false, message: "Não consegui criar a conta." };
  const code = String(formData.get("code") ?? "");
  const username = parseUsername(formData.get("username"));
  if (!username.ok) return { ok: false, message: username.message };
  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };
  if (formData.get("terms") !== "on") return { ok: false, message: "Marque que leu os termos e a privacidade para continuar." };

  const sql = tryGetSystemSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };
  try {
    const invite = await findInviteByCode(sql, code);
    if (!invite.found || invite.status !== "open") {
      return { ok: false, message: "Este convite não vale mais. Peça um novo a quem te convidou." };
    }
    if (await findUserByUsername(sql, username.value)) return { ok: false, message: "Esse usuário já existe. Escolha outro." };
    const user = await acceptInvite(sql, { inviteId: invite.id, familyId: invite.familyId, username: username.value, password: password.value });
    if (!user) return { ok: false, message: "Este convite não vale mais. Peça um novo a quem te convidou." };
    const token = newSessionToken();
    await insertSession(sql, user.id, hashSessionToken(token));
    await setSessionCookie(token);
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "Esse usuário já existe. Escolha outro." };
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("invite accept failed");
    return { ok: false, message: "Não consegui criar a conta agora." };
  }
  redirect("/");
}

export type InviteActionState = { ok: boolean; message: string; link?: string };

/** One tap: a new single-use link (7 days) to bring a person into this family. */
export async function createInviteAction(): Promise<InviteActionState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canManageAccounts(actor) || !actor.family) return { ok: false, message: "Só quem é dono da família convida pessoas." };
  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };
  try {
    const invite = await createInvite(sql, actor.id);
    if (invite === "too_many") return { ok: false, message: "Já há muitos convites abertos. Revogue algum antes de criar outro." };
    revalidatePath("/usuarios");
    const origin = await requestOrigin();
    return { ok: true, message: "Convite criado. Copie o link agora: ele vale por 7 dias e para uma pessoa.", link: `${origin}/convite/${invite.code}` };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    console.error("create invite failed");
    return { ok: false, message: "Não consegui criar o convite." };
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canManageAccounts(actor)) return;
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const sql = tryGetSql();
  if (!sql) return;
  try {
    await revokeInvite(sql, id);
  } catch (error) {
    console.error("revoke invite failed", error instanceof Error ? error.name : "error");
  }
  revalidatePath("/usuarios");
}
