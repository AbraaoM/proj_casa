import { cookies } from "next/headers";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { findSessionUser } from "@/lib/repositories/accounts";
import type { AccountUser } from "@/lib/auth/types";
import { hashSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth/token";

export async function currentUser(): Promise<AccountUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = tryGetSql();
  if (!sql) return null;
  try {
    return await findSessionUser(sql, hashSessionToken(token));
  } catch (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
