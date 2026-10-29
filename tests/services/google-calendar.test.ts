import { describe, expect, test } from "vitest";
import type { Sql } from "@/lib/db/client";
import { beginGoogleConnect, createAgendaEvent } from "@/lib/services/google-calendar";
import type { AgendaDraft } from "@/lib/domain/calendar";

const sql = { query: async () => { throw new Error("the database must not be touched"); } } as unknown as Sql;

const draft: AgendaDraft = {
  title: "Dentista",
  all_day: true,
  starts_at: "2026-11-02",
  ends_at: null,
  description: null,
  location: null,
  external_key: null,
};

describe("google agenda setup", () => {
  test("refuses to start without the OAuth client or the master key, before the database", async () => {
    await expect(beginGoogleConnect(sql, "user", "https://casa.example", {})).resolves.toEqual({ ok: false, notice: "unconfigured" });
    await expect(beginGoogleConnect(sql, "user", "https://casa.example", {
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
    })).resolves.toEqual({ ok: false, notice: "secret" });
  });

  test("does not create an event when the key is not a person", async () => {
    await expect(createAgendaEvent(sql, draft, "America/Sao_Paulo", {
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      CASA_SECRET_KEY: Buffer.alloc(32).toString("base64"),
    })).rejects.toMatchObject({ code: "agenda_not_connected" });
  });
});
