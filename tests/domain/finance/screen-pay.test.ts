import { describe, expect, it } from "vitest";
import { screenPayKey } from "@/lib/domain/finance/screen-pay";

describe("screen pay key", () => {
  it("is one key per bill and due date", () => {
    expect(screenPayKey("b1", "2026-10-20")).toBe("ui:pay:b1:2026-10-20");
  });
});
