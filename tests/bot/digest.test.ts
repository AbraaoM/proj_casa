import { describe, expect, test } from "vitest";
import { buildDigest, DIGEST_MAX_BUTTONS } from "@/lib/bot/digest";
import type { AttentionItem } from "@/lib/domain/types";

let n = 0;
function item(attention: AttentionItem["attention"], title: string, extra: Partial<AttentionItem> = {}): AttentionItem {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title,
    attention,
    due_date: attention === "undated" ? null : "2026-10-15",
    subject_name: null,
    interval_hours: null,
    ...extra,
  } as AttentionItem;
}

describe("daily summary", () => {
  test("nothing pending: one short line, no buttons", () => {
    expect(buildDigest([])).toEqual({ text: "Bom dia! Nada pedindo atenção na Casa hoje.", buttons: [] });
  });

  test("overdue, today and soon, with a Feito button for what is due", () => {
    const digest = buildDigest([
      item("overdue", "Vermífugo", { subject_name: "Bebê" }),
      item("due_today", "Trocar filtro"),
      item("upcoming", "Revisão do carro", { due_date: "2026-10-20" }),
    ]);
    expect(digest.text).toContain("Atrasado\n• Vermífugo (Bebê), venceu 15/10");
    expect(digest.text).toContain("Hoje\n• Trocar filtro");
    expect(digest.text).toContain("• Revisão do carro, 20/10");
    expect(digest.buttons.map((row) => row[0]!.text)).toEqual(["Feito: Vermífugo", "Feito: Trocar filtro"]);
    expect(digest.buttons[0]![0]!.callback_data).toMatch(/^done:[0-9a-f-]{36}$/);
    // Telegram limits callback_data to 64 bytes.
    expect(Buffer.byteLength(digest.buttons[0]![0]!.callback_data)).toBeLessThanOrEqual(64);
  });

  test("hourly medicines get no Feito button (they need the dose time) and the list is capped", () => {
    const many = Array.from({ length: 20 }, (_, i) => item("overdue", `Tarefa ${i}`));
    const digest = buildDigest([item("due_today", "Remédio", { interval_hours: 8 }), ...many]);
    expect(digest.buttons).toHaveLength(DIGEST_MAX_BUTTONS);
    expect(digest.buttons.some((row) => row[0]!.text.includes("Remédio"))).toBe(false);
    expect(digest.text).toMatch(/e mais \d+/);
  });
});
