/** A thin Telegram Bot API client. https://core.telegram.org/bots/api */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TelegramError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TelegramError";
  }
}

export type TelegramClient = {
  call<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T>;
};

export function telegramClient(token: string, fetchImpl: FetchLike = fetch): TelegramClient {
  return {
    async call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: { ok?: boolean; result?: T; description?: string } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        // fall through to the error below
      }
      // The description never contains the token; the URL (which does) is never thrown.
      if (!response.ok || !data.ok) throw new TelegramError(data.description ?? `Telegram answered ${response.status}.`, response.status);
      return data.result as T;
    },
  };
}

export type TgUser = { id: number; is_bot?: boolean; first_name?: string; username?: string };
export type TgChat = { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string };
export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
  reply_to_message?: { from?: TgUser };
  new_chat_members?: TgUser[];
};
export type TgCallbackQuery = { id: string; from: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: { chat: TgChat; new_chat_member: { status: string } };
};

export type InlineButton = { text: string; callback_data: string };

/** Telegram limits a message to 4096 characters. */
export function clip(text: string, max = 4000): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
