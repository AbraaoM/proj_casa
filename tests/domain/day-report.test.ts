import { describe, expect, it } from "vitest";
import { dayCounts, groupDay, parseReportDay, previewDeeds, type DayDeed } from "@/lib/domain/day-report";
import { buildEveningReport, dayHeading, daySummary, presentDeed } from "@/lib/ui/day";

function deed(partial: Partial<DayDeed> & Pick<DayDeed, "id" | "kind" | "title" | "by">): DayDeed {
  return { detail: null, at: null, ...partial };
}

describe("parseReportDay", () => {
  it("defaults to today and refuses a future day", () => {
    expect(parseReportDay(undefined, "2026-10-31")).toEqual({ ok: true, value: "2026-10-31" });
    expect(parseReportDay("2026-10-30", "2026-10-31")).toEqual({ ok: true, value: "2026-10-30" });
    expect(parseReportDay("2026-11-01", "2026-10-31").ok).toBe(false);
    expect(parseReportDay("ontem", "2026-10-31").ok).toBe(false);
  });
});

describe("presentDeed", () => {
  it("shows a payment as money and keeps a task's subject beside its cost", () => {
    expect(presentDeed({ id: "1", kind: "payment", title: "Conta de luz", detail: null, amount_cents: 18000, by: "bia", at: "18:40" }).detail).toBe("R$ 180,00");
    expect(presentDeed({ id: "2", kind: "task", title: "Vacina", detail: "o cão", amount_cents: 9000, by: "bia", at: null }).detail).toBe("o cão · R$ 90,00");
    expect(presentDeed({ id: "3", kind: "checklist", title: "Limpeza do banheiro", detail: "Banheiro", amount_cents: null, by: "bia", at: "09:14" }).detail).toBe("Banheiro");
  });
});

describe("groupDay", () => {
  it("groups by person, names first, earliest time first", () => {
    const people = groupDay([
      deed({ id: "1", kind: "task", title: "Vacina", by: "bia", at: "11:00" }),
      deed({ id: "2", kind: "checklist", title: "Limpeza", by: "bia", at: "09:00" }),
      deed({ id: "3", kind: "payment", title: "Luz", by: "seu agente", at: "08:00" }),
      deed({ id: "4", kind: "task", title: "Revisão", by: "caio", at: null }),
    ]);
    expect(people.map((person) => person.name)).toEqual(["bia", "caio", "seu agente"]);
    expect(people[0]!.deeds.map((item) => item.title)).toEqual(["Limpeza", "Vacina"]);
    expect(dayCounts(people.flatMap((person) => person.deeds))).toEqual({ checklist: 1, task: 2, payment: 1 });
  });

  it("previews the latest lines", () => {
    const people = groupDay([
      deed({ id: "1", kind: "task", title: "Cedo", by: "bia", at: "08:00" }),
      deed({ id: "2", kind: "task", title: "Tarde", by: "bia", at: "18:00" }),
    ]);
    expect(previewDeeds(people, 1).map((item) => item.title)).toEqual(["Tarde"]);
  });
});

describe("evening report", () => {
  it("says when nobody recorded anything", () => {
    expect(buildEveningReport([])).toBe("Fechando o dia. Ninguém registrou tarefa, pagamento ou checklist.");
    expect(daySummary({ checklist: 0, task: 0, payment: 0 })).toBe("");
  });

  it("lists kind, title, detail and time, and caps the list", () => {
    const people = groupDay([
      deed({ id: "1", kind: "checklist", title: "Limpeza do banheiro", detail: "Banheiro", by: "bia", at: "09:14" }),
      deed({ id: "2", kind: "payment", title: "Conta de luz", detail: "R$ 180,00", by: "bia", at: "18:40" }),
    ]);
    const text = buildEveningReport(people);
    expect(text).toContain("Fechando o dia. Quem fez o quê:");
    expect(text).toContain("bia\n• Checklist · Limpeza do banheiro · Banheiro · 09:14");
    expect(text).toContain("• Pagamento · Conta de luz · R$ 180,00 · 18:40");
    expect(text).toContain("O mesmo relatório está em Hoje, no app.");

    const many = groupDay(Array.from({ length: 30 }, (_, index) => deed({ id: String(index), kind: "task", title: `Tarefa ${index}`, by: "bia", at: null })));
    expect(buildEveningReport(many, 5)).toContain("• e mais 25");
    expect(daySummary({ checklist: 2, task: 1, payment: 1 })).toBe("1 tarefa · 1 pagamento · 2 no checklist");
    expect(dayHeading("2026-10-31", "2026-10-31")).toBe("Hoje");
    expect(dayHeading("2026-10-30", "2026-10-31")).toBe("Ontem");
    expect(dayHeading("2026-10-01", "2026-10-31")).toBe("1 out");
  });
});
