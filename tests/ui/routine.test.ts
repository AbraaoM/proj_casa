import { describe, expect, test } from "vitest";
import { frequencyLabel, lastDoneLine, progressPercent, sinceLabel, statusPhrase } from "@/lib/ui/routine";

describe("checklist copy", () => {
  test("frequency in plain Portuguese", () => {
    expect(frequencyLabel({ interval_days: 1, interval_months: null })).toBe("todo dia");
    expect(frequencyLabel({ interval_days: 3, interval_months: null })).toBe("a cada 3 dias");
    expect(frequencyLabel({ interval_days: 7, interval_months: null })).toBe("toda semana");
    expect(frequencyLabel({ interval_days: 14, interval_months: null })).toBe("a cada 2 semanas");
    expect(frequencyLabel({ interval_days: 15, interval_months: null })).toBe("a cada 15 dias");
    expect(frequencyLabel({ interval_days: null, interval_months: 1 })).toBe("todo mês");
    expect(frequencyLabel({ interval_days: null, interval_months: 6 })).toBe("a cada 6 meses");
  });

  test("since and who", () => {
    expect(sinceLabel(null)).toBe("nunca registrada");
    expect(sinceLabel(0)).toBe("hoje");
    expect(sinceLabel(1)).toBe("ontem");
    expect(lastDoneLine(5, "pessoa_a")).toBe("há 5 dias · pessoa_a");
    expect(lastDoneLine(null, null)).toBe("nunca registrada");
  });

  test("status phrase", () => {
    expect(statusPhrase({ status: "overdue", days_overdue: 1, days_until_due: -1 })).toBe("atrasada há 1 dia");
    expect(statusPhrase({ status: "overdue", days_overdue: 3, days_until_due: -3 })).toBe("atrasada há 3 dias");
    expect(statusPhrase({ status: "never", days_overdue: 0, days_until_due: 0 })).toBe("sem registro");
    expect(statusPhrase({ status: "due_soon", days_overdue: 0, days_until_due: 0 })).toBe("vence hoje");
    expect(statusPhrase({ status: "due_soon", days_overdue: 0, days_until_due: 1 })).toBe("vence amanhã");
    expect(statusPhrase({ status: "due_soon", days_overdue: 0, days_until_due: 2 })).toBe("vence em 2 dias");
    expect(statusPhrase({ status: "ok", days_overdue: 0, days_until_due: 5 })).toBe("em dia");
    expect(progressPercent(1.7)).toBe(100);
    expect(progressPercent(0.5)).toBe(50);
  });
});
