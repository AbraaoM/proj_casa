import { describe, expect, it } from "vitest";
import type { AttentionState } from "@/lib/domain/types";
import { housePanelDigest, housePanelSlice } from "@/lib/ui/house-panel";

function item(attention: AttentionState, id: string) {
  return { id, attention };
}

describe("housePanelSlice", () => {
  it("lists every late task when they fit on the card", () => {
    const items = [item("overdue", "a"), item("due_today", "b")];
    const panel = housePanelSlice(items);
    expect(panel.shown.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(panel.hidden).toBe(0);
  });

  it("leaves later tasks off the card when something is already late", () => {
    const items = [item("overdue", "a"), item("upcoming", "b"), item("undated", "c")];
    const panel = housePanelSlice(items);
    expect(panel.shown.map((entry) => entry.id)).toEqual(["a"]);
    expect(panel.hidden).toBe(2);
  });

  it("shows only what is late or due today, capped at four", () => {
    const items = [
      item("overdue", "1"),
      item("overdue", "2"),
      item("overdue", "3"),
      item("due_today", "4"),
      item("due_today", "5"),
      item("upcoming", "6"),
    ];
    const panel = housePanelSlice(items);
    expect(panel.shown.map((entry) => entry.id)).toEqual(["1", "2", "3", "4"]);
    expect(panel.hidden).toBe(2);
  });

  it("previews the nearest tasks when nothing is late", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => item("upcoming", id));
    const panel = housePanelSlice(items);
    expect(panel.shown).toHaveLength(4);
    expect(panel.hidden).toBe(1);
  });
});

describe("housePanelDigest", () => {
  it("counts each bucket, skipping the empty ones", () => {
    const items = [
      item("overdue", "1"),
      item("overdue", "2"),
      item("overdue", "3"),
      item("due_today", "4"),
      item("upcoming", "5"),
      item("undated", "6"),
      item("undated", "7"),
    ];
    expect(housePanelDigest(items)).toBe("3 atrasadas · 1 vence hoje · 1 a vencer · 2 sem data");
  });

  it("is empty when there is nothing", () => {
    expect(housePanelDigest([])).toBe("");
  });
});
