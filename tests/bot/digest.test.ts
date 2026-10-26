import { describe, expect, test } from "vitest";
import { buildDigest, DIGEST_MAX_BUTTONS, type DigestRoutine } from "@/lib/bot/digest";
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

describe("daily summary: house checklist", () => {
  const state = (extra: Partial<DigestRoutine["state"]>): DigestRoutine["state"] => ({
    status: "ok", interval_days: 3, due_date: "2026-10-15", days_until_due: 2, days_overdue: 0, days_since: 1, progress: 0.3, ...extra,
  });
  const routine = (title: string, extra: Partial<DigestRoutine["state"]>, area = "Banheiro"): DigestRoutine => {
    n += 1;
    return { id: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`, title, area_name: area, state: state(extra) };
  };

  test("late, never recorded and due today routines get a Casa section with Feito buttons; the rest stay out", () => {
    const late = routine("Limpeza do banheiro", { status: "overdue", days_until_due: -2, days_overdue: 2, days_since: 5 });
    const never = routine("Trocar roupa de cama", { status: "never", days_until_due: 0, days_since: null }, "Quarto");
    const ok = routine("Limpar a geladeira", { status: "ok", days_until_due: 20 }, "Cozinha");
    const asAttention = item("overdue", late.title, { id: late.id, subject_name: "Banheiro" });
    const digest = buildDigest([asAttention, item("due_today", "Trocar filtro")], [late, never, ok]);
    expect(digest.text).toContain("Limpeza e rotina da casa\n• Limpeza do banheiro (Banheiro): atrasada há 2 dias, última vez há 5 dias\n• Trocar roupa de cama (Quarto): sem registro");
    expect(digest.text).not.toContain("Limpar a geladeira");
    expect(digest.text).not.toContain("Atrasado\n");
    expect(digest.buttons.map((row) => row[0]!.text)).toEqual(["Feito: Trocar filtro", "Feito: Limpeza do banheiro", "Feito: Trocar roupa de cama"]);
    expect(digest.buttons[1]![0]!.callback_data).toBe(`done:${late.id}`);
  });

  test("only routines due: still a summary, never 'nada pedindo atenção'", () => {
    const digest = buildDigest([], [routine("Limpar bancada e fogão", { status: "due_soon", days_until_due: 0, days_since: 1 }, "Cozinha")]);
    expect(digest.text).toContain("Limpar bancada e fogão (Cozinha): vence hoje, última vez ontem");
    expect(digest.buttons).toHaveLength(1);
  });
});
