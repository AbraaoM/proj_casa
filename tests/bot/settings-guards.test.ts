import { describe, expect, test, vi } from "vitest";
import { NO_MASTER_KEY, NOT_ADMIN, readSettingsForm, registerWebhook, rotateWebhookSecret, saveSettings, setEnabled, testBot } from "@/lib/bot/settings";
import { sameSecret } from "@/lib/bot/runtime";
import type { Sql } from "@/lib/db/client";

// A database that must not be touched: the guards answer first.
const untouchable = { query: vi.fn(async () => { throw new Error("database touched"); }) } as unknown as Sql;
const member = { id: "00000000-0000-4000-8000-000000000002", username: "pessoa", role: "member" as const };
const admin = { id: "00000000-0000-4000-8000-000000000001", username: "dono", role: "admin" as const };
const input = { provider: "groq", model: "", baseUrl: "", aiApiKey: "gsk_fake_key_for_tests", telegramToken: "" };

describe("bot settings guards", () => {
  test("only the master account can view or change the bot", async () => {
    for (const actor of [null, member]) {
      expect(await saveSettings(untouchable, actor, input)).toEqual({ ok: false, message: NOT_ADMIN });
      expect(await setEnabled(untouchable, actor, true)).toEqual({ ok: false, message: NOT_ADMIN });
      expect(await rotateWebhookSecret(untouchable, actor)).toEqual({ ok: false, message: NOT_ADMIN });
      expect(await registerWebhook(untouchable, actor, "https://casa.exemplo.test")).toEqual({ ok: false, message: NOT_ADMIN });
      expect(await testBot(untouchable, actor)).toEqual({ ok: false, message: NOT_ADMIN });
    }
  });

  test("without CASA_SECRET_KEY no secret is saved", async () => {
    expect(await saveSettings(untouchable, admin, input, { env: {} })).toEqual({ ok: false, message: NO_MASTER_KEY });
    expect(await rotateWebhookSecret(untouchable, admin, { env: {} })).toEqual({ ok: false, message: NO_MASTER_KEY });
    expect(await saveSettings(untouchable, admin, { ...input, aiApiKey: "", telegramToken: "123456:x" }, { env: {} })).toEqual({ ok: false, message: NO_MASTER_KEY });
  });

  test("the webhook needs an https address", async () => {
    expect(await registerWebhook(untouchable, admin, "http://localhost:3000")).toMatchObject({ ok: false, message: expect.stringContaining("https") });
  });

  test("the form is read as trimmed text", () => {
    const form = new FormData();
    form.set("provider", " openai ");
    form.set("model", "gpt-x");
    expect(readSettingsForm(form)).toEqual({ provider: "openai", model: "gpt-x", baseUrl: "", aiApiKey: "", telegramToken: "" });
  });

  test("secret comparison", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret(null, "abc")).toBe(false);
    expect(sameSecret("abc", null)).toBe(false);
  });
});
