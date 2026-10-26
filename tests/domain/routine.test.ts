import { describe, expect, test } from "vitest";
import {
  buildSheet,
  dueAfterEdit,
  initialRoutineDue,
  intervalInDays,
  isRoutine,
  routineState,
  sortRoutines,
  type RoutineInput,
} from "@/lib/domain/routine";

const TODAY = "2026-10-26";

function routine(extra: Partial<RoutineInput> = {}): RoutineInput {
  return {
    id: "r1",
    title: "Limpeza geral",
    priority: "normal",
    due_date: null,
    last_done_on: null,
    interval_days: 10,
    interval_months: null,
    area_name: "Banheiro",
    ...extra,
  };
}

describe("isRoutine", () => {
  test("a house item with days or months is a routine; one-off tasks and other domains are not", () => {
    expect(isRoutine({ domain: "house", interval_days: 3, interval_months: null, interval_hours: null })).toBe(true);
    expect(isRoutine({ domain: "house", interval_days: null, interval_months: 6, interval_hours: null })).toBe(true);
    expect(isRoutine({ domain: "house", interval_days: null, interval_months: null, interval_hours: null })).toBe(false);
    expect(isRoutine({ domain: "dog", interval_days: 30, interval_months: null, interval_hours: null })).toBe(false);
  });
});

describe("intervalInDays", () => {
  test("days as is, months as the real length from the last time", () => {
    expect(intervalInDays(routine({ interval_days: 3 }), TODAY)).toBe(3);
    expect(intervalInDays(routine({ interval_days: null, interval_months: 1, last_done_on: "2026-02-01" }), TODAY)).toBe(28);
    expect(intervalInDays(routine({ interval_days: null, interval_months: 6, last_done_on: "2026-01-01" }), TODAY)).toBe(181);
  });
});

describe("routineState", () => {
  test("done recently: em dia, with the share of the interval used", () => {
    const state = routineState(routine({ last_done_on: "2026-10-24", due_date: "2026-11-03" }), TODAY);
    expect(state).toMatchObject({ status: "ok", days_since: 2, days_until_due: 8, interval_days: 10, due_date: "2026-11-03" });
    expect(state.progress).toBeCloseTo(0.2);
  });

  test("done today: zero days since, not minus zero", () => {
    expect(routineState(routine({ last_done_on: TODAY, due_date: "2026-11-05" }), TODAY).days_since).toBe(0);
  });

  test("75% of the interval used: vence logo", () => {
    const state = routineState(routine({ last_done_on: "2026-10-18", due_date: "2026-10-28" }), TODAY);
    expect(state.status).toBe("due_soon");
    expect(state.progress).toBeCloseTo(0.8);
  });

  test("due today or tomorrow is vence logo even on a short interval", () => {
    expect(routineState(routine({ interval_days: 3, last_done_on: "2026-10-24", due_date: "2026-10-27" }), TODAY).status).toBe("due_soon");
    expect(routineState(routine({ interval_days: 1, last_done_on: "2026-10-25", due_date: "2026-10-26" }), TODAY).status).toBe("due_soon");
  });

  test("past the due date: atrasada, with the days late", () => {
    const state = routineState(routine({ interval_days: 3, last_done_on: "2026-10-20", due_date: "2026-10-23" }), TODAY);
    expect(state).toMatchObject({ status: "overdue", days_overdue: 3, days_since: 6 });
    expect(state.progress).toBeCloseTo(2);
  });

  test("never done: sem registro, treated as due today", () => {
    const state = routineState(routine(), TODAY);
    expect(state).toMatchObject({ status: "never", days_since: null, due_date: TODAY, days_until_due: 0, progress: 1 });
  });

  test("never done but already late (created with a past due date): atrasada", () => {
    expect(routineState(routine({ due_date: "2026-10-20" }), TODAY).status).toBe("overdue");
  });

  test("no due date but a last time: due date derived from the interval", () => {
    const state = routineState(routine({ last_done_on: "2026-10-20" }), TODAY);
    expect(state).toMatchObject({ due_date: "2026-10-30", days_until_due: 4 });
  });

  test("a snoozed routine follows its due date, not only the last time", () => {
    const state = routineState(routine({ interval_days: 3, last_done_on: "2026-10-20", due_date: "2026-10-27" }), TODAY);
    expect(state.status).toBe("due_soon");
    expect(state.days_overdue).toBe(0);
  });
});

describe("sortRoutines", () => {
  test("atrasada, then sem registro, then vence logo, then em dia; inside, the most consumed first", () => {
    const items = [
      routine({ id: "ok", last_done_on: "2026-10-25", due_date: "2026-11-04" }),
      routine({ id: "soon", last_done_on: "2026-10-18", due_date: "2026-10-28" }),
      routine({ id: "never" }),
      routine({ id: "late-1", interval_days: 10, last_done_on: "2026-10-15", due_date: "2026-10-25" }),
      routine({ id: "late-2", interval_days: 3, last_done_on: "2026-10-20", due_date: "2026-10-23" }),
    ];
    expect(sortRoutines(items, TODAY).map((entry) => entry.id)).toEqual(["late-2", "late-1", "never", "soon", "ok"]);
  });

  test("ties break by priority, then room, then task", () => {
    const items = [
      routine({ id: "c", area_name: "Sala", title: "Aspirar" }),
      routine({ id: "b", area_name: "Cozinha", title: "Bancada" }),
      routine({ id: "a", area_name: "Cozinha", title: "Bancada", priority: "high" }),
      routine({ id: "d", area_name: "Cozinha", title: "Aspirar" }),
    ];
    expect(sortRoutines(items, TODAY).map((entry) => entry.id)).toEqual(["a", "d", "b", "c"]);
  });

  test("keeps the input fields and adds the state", () => {
    const [first] = sortRoutines([routine({ id: "x", last_done_on: "2026-10-25", due_date: "2026-11-04" })], TODAY);
    expect(first).toMatchObject({ id: "x", title: "Limpeza geral", state: { status: "ok", days_since: 1 } });
  });
});

describe("initialRoutineDue", () => {
  test("from the last time when known, otherwise today", () => {
    expect(initialRoutineDue({ last_done_on: "2026-10-20", interval_days: 3, interval_months: null }, TODAY)).toBe("2026-10-23");
    expect(initialRoutineDue({ last_done_on: "2026-08-31", interval_days: null, interval_months: 6 }, TODAY)).toBe("2027-02-28");
    expect(initialRoutineDue({ last_done_on: null, interval_days: 7, interval_months: null }, TODAY)).toBe(TODAY);
  });
});

describe("dueAfterEdit", () => {
  const current = { domain: "house" as const, status: "active" as const, due_date: "2026-10-23", last_done_on: "2026-10-20", interval_days: 3, interval_months: null, interval_hours: null };

  test("a new frequency moves the due date from the last time", () => {
    expect(dueAfterEdit(current, { interval_days: 7, interval_months: null, interval_hours: null }, TODAY)).toBe("2026-10-27");
    expect(dueAfterEdit(current, { interval_months: 1, interval_days: null, interval_hours: null }, TODAY)).toBe("2026-11-20");
  });

  test("a new last time moves the due date too", () => {
    expect(dueAfterEdit(current, { last_done_on: "2026-10-25" }, TODAY)).toBe("2026-10-28");
  });

  test("an explicit due date, a removed frequency or another domain keep what was sent", () => {
    expect(dueAfterEdit(current, { interval_days: 7, due_date: "2026-11-01" }, TODAY)).toBeUndefined();
    expect(dueAfterEdit(current, { interval_days: null }, TODAY)).toBeUndefined();
    expect(dueAfterEdit({ ...current, domain: "dog" }, { interval_days: 7 }, TODAY)).toBeUndefined();
    expect(dueAfterEdit(current, { title: "Outro nome" }, TODAY)).toBeUndefined();
  });

  test("a routine never done gets today when it turns into a routine", () => {
    expect(dueAfterEdit({ ...current, interval_days: null, last_done_on: null, due_date: null }, { interval_days: 7 }, TODAY)).toBe(TODAY);
  });
});

describe("buildSheet", () => {
  test("one row per routine, one column per day, newest last; marks only inside the window", () => {
    const sheet = buildSheet({
      routines: [{ id: "r1", title: "Limpeza geral" }, { id: "r2", title: "Toalhas" }],
      events: [
        { care_item_id: "r1", done_on: "2026-10-26", by: "pessoa_a", time: "08:10", notes: null },
        { care_item_id: "r1", done_on: "2026-10-24", by: "pessoa_b", time: null, notes: "com cloro" },
        { care_item_id: "r2", done_on: "2026-10-01", by: "pessoa_a", time: null, notes: null },
        { care_item_id: "other", done_on: "2026-10-26", by: "pessoa_a", time: null, notes: null },
      ],
      today: TODAY,
      days: 3,
    });
    expect(sheet.days).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(sheet.rows[0]!.cells.map((cell) => cell.marks.map((mark) => mark.by))).toEqual([["pessoa_b"], [], ["pessoa_a"]]);
    expect(sheet.rows[0]!.cells[0]!.marks[0]!.notes).toBe("com cloro");
    expect(sheet.rows[1]!.cells.every((cell) => cell.marks.length === 0)).toBe(true);
  });
});
