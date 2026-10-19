"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { newAgentKey, parseAgentLabel, type KeyActionState } from "@/lib/agent/keys";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { isUuid } from "@/lib/domain/dates";
import { insertAgentKey, revokeAgentKey } from "@/lib/repositories/agent-keys";

export async function createAgentKeyAction(_state: KeyActionState, formData: FormData): Promise<KeyActionState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");

  const label = parseAgentLabel(formData.get("label"));
  if (!label.ok) return { ok: false, message: label.message };

  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  const key = newAgentKey();
  try {
    await insertAgentKey(sql, {
      label: label.value,
      prefix: key.prefix,
      hash: key.hash,
      createdBy: actor.id,
    });
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("create agent key failed");
    return { ok: false, message: "Não consegui gerar a chave." };
  }

  revalidatePath("/agentes");
  return {
    ok: true,
    message: "Chave gerada. Copie agora. Ela não aparece de novo.",
    token: key.token,
    endpoint: `${await agentEndpoint()}/api/agent`,
    mcpEndpoint: `${await agentEndpoint()}/api/mcp`,
  };
}

export async function revokeAgentKeyAction(_state: KeyActionState, formData: FormData): Promise<KeyActionState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Chave não encontrada." };

  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };

  try {
    const revoked = await revokeAgentKey(sql, id, actor);
    if (!revoked) return { ok: false, message: "Essa chave já foi revogada ou é de outra pessoa." };
  } catch (error) {
    if (isMissingSchema(error)) {
      return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    }
    console.error("revoke agent key failed");
    return { ok: false, message: "Não consegui revogar a chave." };
  }

  revalidatePath("/agentes");
  return { ok: true, message: "Chave revogada." };
}

async function agentEndpoint(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const forwarded = headerList.get("x-forwarded-proto");
  const proto = forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
