"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/dates";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema, isUniqueViolation } from "@/lib/db/errors";
import {
  deleteOtherSessions,
  deleteSession,
  deleteUserSessions,
  findUserByPassword,
  findUserByUsername,
  insertSession,
  insertUser,
  updateOwnPassword,
  updateUserPassword,
} from "@/lib/repositories/accounts";
import { clearSessionCookie, currentUser, readSessionToken, setSessionCookie } from "@/lib/auth/session";
import { hashSessionToken, newSessionToken } from "@/lib/auth/token";
import type { FormState } from "@/lib/auth/types";
import { parseLogin, parsePassword, parsePasswordPair, parseUsername } from "@/lib/auth/validate";

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseLogin(formData.get("username"), formData.get("password"));
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const user = await findUserByPassword(sql, parsed.value.username, parsed.value.password);
    if (!user) return { ok: false, message: "Usuário ou senha inválidos." };
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

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  const sql = tryGetSql();
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
  const sql = tryGetSql();
  if (!token || !sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const changed = await updateOwnPassword(sql, actor.id, next.value, current.value);
    if (!changed) return { ok: false, message: "A senha atual não confere." };
    await deleteOtherSessions(sql, actor.id, hashSessionToken(token));
    revalidatePath("/usuarios");
    return { ok: true, message: "Senha alterada." };
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("password change failed");
    return { ok: false, message: "Não consegui alterar a senha." };
  }
}

export async function createUserAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");

  const username = parseUsername(formData.get("username"));
  if (!username.ok) return { ok: false, message: username.message };
  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };

  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const existing = await findUserByUsername(sql, username.value);
    if (existing) return { ok: false, message: "Esse usuário já existe." };
    await insertUser(sql, username.value, password.value);
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

  const password = parsePasswordPair(formData.get("password"), formData.get("confirm"));
  if (!password.ok) return { ok: false, message: password.message };

  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const changed = await updateUserPassword(sql, userId, password.value);
    if (!changed) return { ok: false, message: "Usuário não encontrado." };
    await deleteUserSessions(sql, userId);
    revalidatePath("/usuarios");
    return { ok: true, message: "Senha alterada." };
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("set password failed");
    return { ok: false, message: "Não consegui alterar a senha." };
  }
}
