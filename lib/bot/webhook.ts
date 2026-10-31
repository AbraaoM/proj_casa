import type { LanguageModel } from "ai";
import { withCaller, type AgentCaller } from "@/lib/agent/actor";
import { recordActivity } from "@/lib/agent/activity";
import { AGENT_TOOLS, type ToolContext } from "@/lib/agent/tools";
import { HISTORY_LIMIT, modelFailureText, runAgentTurn } from "@/lib/bot/agent";
import { DIGEST_MAX_BUTTONS, routineLine } from "@/lib/bot/digest";
import { listRoutines } from "@/lib/services/routines";
import { readSettings } from "@/lib/services/settings";
import { clip, type InlineButton, type TelegramClient, type TgMessage, type TgUpdate } from "@/lib/bot/telegram";
import type { Sql } from "@/lib/db/client";
import {
  addMessage, claimUpdate, consumeLinkCode, ensureTelegramKey, findLinkByTelegramUser, linkTelegram,
  recentMessages, renameTelegramAgent, setChatDigest, setPrivateChat, upsertChat, type TelegramLink,
} from "@/lib/repositories/bot";

export type ModelResult = { ok: true; model: LanguageModel } | { ok: false; message: string };

export type WebhookDeps = {
  sql: Sql;
  telegram: TelegramClient;
  botUsername: string | null;
  model: () => Promise<ModelResult>;
  context: () => Promise<ToolContext>;
};

export const COPY = {
  notLinked: "Ainda não conheço você. Abra a Casa, toque em Conectar Telegram e volte aqui.",
  linkExpired: "Esse link já foi usado ou expirou. Toque em Conectar Telegram na Casa de novo.",
  linked: (username: string, agentName: string) =>
    `Pronto, ${username}: sua conta da Casa está ligada. Hoje meu nome é ${agentName}. Se quiser outro, é só dizer como quer me chamar.`,
  digestOff: "Certo, não mando mais o resumo do dia neste chat.",
  digestOn: "Certo, mando o resumo neste chat: de manhã o que pede atenção, e às 22h quem fez o quê.",
  privateFirst: "Me mande um oi no privado primeiro, para eu poder responder por lá.",
  answeredPrivately: "Te respondi no privado.",
  houseAllGood: "Tudo em dia na limpeza e rotina da casa.",
  houseTitle: "Limpeza e rotina da casa, mais urgentes:",
} as const;

/** How many routines /casa lists. */
export const HOUSE_COMMAND_LIMIT = 8;

/** /casa: the most urgent routines of the checklist, with one-tap Feito. No AI call. */
export async function houseChecklistMessage(sql: Sql, today: string): Promise<{ text: string; buttons: InlineButton[][] }> {
  const settings = await readSettings(sql);
  const routines = await listRoutines(sql, { area: null, status: null, limit: null, today, timeZone: settings.timezone });
  const urgent = routines.filter((routine) => routine.state.status !== "ok").slice(0, HOUSE_COMMAND_LIMIT);
  if (urgent.length === 0) return { text: COPY.houseAllGood, buttons: [] };
  return {
    text: [COPY.houseTitle, ...urgent.map(routineLine), "", "Toque em Feito ou me conte o que foi feito."].join("\n"),
    buttons: urgent.slice(0, DIGEST_MAX_BUTTONS).map((routine) => [{ text: `Feito: ${routine.title}`.slice(0, 60), callback_data: `done:${routine.id}` }]),
  };
}

type ChatKind = "private" | "group" | "supergroup";

export async function handleTelegramUpdate(update: TgUpdate, deps: WebhookDeps): Promise<void> {
  if (!(await claimUpdate(deps.sql, update.update_id))) return;

  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    if (chat.type === "group" || chat.type === "supergroup") {
      const active = !["left", "kicked"].includes(new_chat_member.status);
      await upsertChat(deps.sql, { id: chat.id, kind: chat.type, title: chat.title ?? null, active });
    }
    return;
  }
  if (update.callback_query) return handleCallback(update.callback_query, deps);
  if (update.message?.text && update.message.from && !update.message.from.is_bot) return handleText(update.message, deps);
}

async function callerFor(sql: Sql, link: TelegramLink): Promise<{ caller: AgentCaller; agentName: string }> {
  const key = await ensureTelegramKey(sql, link.userId);
  return { caller: { userId: link.userId, username: link.username, keyId: key.keyId, agentName: key.agentName }, agentName: key.agentName };
}

function isAddressed(message: TgMessage, botUsername: string | null, agentName: string): boolean {
  const text = message.text ?? "";
  if (text.startsWith("/")) return true;
  if (botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) return true;
  if (message.reply_to_message?.from?.is_bot && (!botUsername || message.reply_to_message.from.username?.toLowerCase() === botUsername.toLowerCase())) return true;
  const name = agentName.trim().toLowerCase();
  return name.length > 1 && new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}([^\\p{L}]|$)`, "iu").test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMention(text: string, botUsername: string | null): string {
  if (!botUsername) return text.trim();
  return text.replace(new RegExp(`@${escapeRegExp(botUsername)}\\b`, "gi"), "").trim();
}

async function send(deps: WebhookDeps, chatId: number, text: string, replyTo?: number) {
  await deps.telegram.call("sendMessage", {
    chat_id: chatId,
    text: clip(text),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
}

async function handleText(message: TgMessage, deps: WebhookDeps): Promise<void> {
  const from = message.from!;
  const chat = message.chat;
  if (chat.type === "channel") return;
  const kind = chat.type as ChatKind;
  const inGroup = kind !== "private";
  const text = message.text!.trim();
  const command = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/i.exec(text);

  await upsertChat(deps.sql, { id: chat.id, kind, title: chat.title ?? null });

  // /start <code>: the deep link from the "Conectar Telegram" button.
  if (command && command[1]!.toLowerCase() === "start") {
    const code = command[2]?.trim();
    if (!code) {
      const link = await findLinkByTelegramUser(deps.sql, from.id);
      if (!link) return send(deps, chat.id, COPY.notLinked);
      const { agentName } = await callerFor(deps.sql, link);
      if (!inGroup) await setPrivateChat(deps.sql, from.id, chat.id);
      return send(deps, chat.id, COPY.linked(link.username, agentName));
    }
    const userId = await consumeLinkCode(deps.sql, code);
    if (!userId) return send(deps, chat.id, COPY.linkExpired);
    await linkTelegram(deps.sql, { userId, telegramUserId: from.id, privateChatId: inGroup ? null : chat.id, telegramName: from.first_name ?? from.username ?? null });
    const link = await findLinkByTelegramUser(deps.sql, from.id);
    const { agentName } = await callerFor(deps.sql, link!);
    return send(deps, chat.id, COPY.linked(link!.username, agentName));
  }

  const link = await findLinkByTelegramUser(deps.sql, from.id);
  if (!link) {
    // In the group, only answer an unknown person who talks to the bot; otherwise stay quiet.
    if (!inGroup || isAddressed(message, deps.botUsername, "")) await send(deps, chat.id, COPY.notLinked, inGroup ? message.message_id : undefined);
    return;
  }
  if (!inGroup && link.privateChatId !== chat.id) await setPrivateChat(deps.sql, from.id, chat.id);
  const { caller, agentName } = await callerFor(deps.sql, link);

  if (command && ["resumo_off", "resumo_on"].includes(command[1]!.toLowerCase())) {
    const on = command[1]!.toLowerCase() === "resumo_on";
    await setChatDigest(deps.sql, chat.id, on);
    return send(deps, chat.id, on ? COPY.digestOn : COPY.digestOff);
  }

  if (command && command[1]!.toLowerCase() === "casa") {
    const { today } = await deps.context();
    const house = await houseChecklistMessage(deps.sql, today);
    await deps.telegram.call("sendMessage", {
      chat_id: chat.id,
      text: clip(house.text),
      ...(house.buttons.length > 0 ? { reply_markup: { inline_keyboard: house.buttons } } : {}),
    });
    return;
  }

  const author = from.first_name ?? link.username;
  const clean = stripMention(text, deps.botUsername);
  if (inGroup && !isAddressed(message, deps.botUsername, agentName)) {
    // Privacy mode off: the bot reads the group to keep context, and answers only when called.
    await addMessage(deps.sql, { chatId: chat.id, userId: link.userId, role: "user", author, content: clean });
    return;
  }

  const model = await deps.model();
  if (!model.ok) return send(deps, chat.id, model.message, inGroup ? message.message_id : undefined);

  const history = await recentMessages(deps.sql, chat.id, HISTORY_LIMIT);
  await addMessage(deps.sql, { chatId: chat.id, userId: link.userId, role: "user", author, content: clean });
  let reply: string;
  let privateText: string | null = null;
  try {
    const result = await runAgentTurn({
      model: model.model,
      context: await deps.context(),
      caller,
      agentName,
      personName: author,
      inGroup,
      history,
      text: clean,
      rename: (name) => renameTelegramAgent(deps.sql, link.userId, name),
    });
    reply = result.text;
    privateText = result.privateText;
  } catch (error) {
    console.error("bot turn failed", error instanceof Error ? error.name : "error");
    reply = modelFailureText(error);
  }

  if (privateText) {
    if (link.privateChatId) {
      await send(deps, link.privateChatId, privateText);
      await addMessage(deps.sql, { chatId: link.privateChatId, userId: null, role: "assistant", author: null, content: privateText });
      reply = reply && reply !== privateText ? reply : COPY.answeredPrivately;
    } else {
      reply = COPY.privateFirst;
    }
  }
  await addMessage(deps.sql, { chatId: chat.id, userId: null, role: "assistant", author: null, content: reply });
  await send(deps, chat.id, reply, inGroup ? message.message_id : undefined);
}

type DoneResult = { event?: { id: string; title: string }; ask_cost?: boolean; idempotent_replay?: boolean };

/** Inline "Feito" from the daily summary: done as the person who tapped. */
async function handleCallback(query: NonNullable<TgUpdate["callback_query"]>, deps: WebhookDeps): Promise<void> {
  const answer = (text: string) => deps.telegram.call("answerCallbackQuery", { callback_query_id: query.id, text });
  const match = /^done:([0-9a-f-]{36})$/.exec(query.data ?? "");
  if (!match) return void (await answer("Botão desconhecido."));
  const link = await findLinkByTelegramUser(deps.sql, query.from.id);
  if (!link) return void (await answer(COPY.notLinked));
  const { caller } = await callerFor(deps.sql, link);
  const tool = AGENT_TOOLS.find((candidate) => candidate.name === "marcar_feito")!;
  const context = await deps.context();
  let status = 200;
  let raw: unknown = null;
  try {
    // One key per item and day, so a double tap records once.
    raw = await withCaller(caller, "telegram", () => tool.run({ item_id: match[1], external_key: `tg:done:${match[1]}:${context.today}` }, context));
  } catch {
    status = 400;
  } finally {
    await recordActivity(caller, "telegram", "tool marcar_feito", status);
  }
  const result = raw as DoneResult | null;
  if (!result?.event) return void (await answer("Não consegui marcar. Abra a Casa para ver."));
  await answer(result.idempotent_replay ? "Já estava marcado." : `${result.event.title}: feito`);
  const chatId = query.message?.chat.id;
  if (result.ask_cost && !result.idempotent_replay && chatId) {
    const person = query.from.first_name ?? link.username;
    await send(deps, chatId, `${person}, quanto custou ${result.event.title}? Se não teve custo, é só dizer.`);
    // The memory keeps the event id so the next answer can go to registrar_custo.
    await addMessage(deps.sql, {
      chatId,
      userId: null,
      role: "assistant",
      author: null,
      content: `Perguntei a ${person} quanto custou ${result.event.title} (event_id ${result.event.id}).`,
    });
  }
}
