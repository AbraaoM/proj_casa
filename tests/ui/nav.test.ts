import { describe, expect, it } from "vitest";
import { BOTTOM_BAR, MORE_ENTRIES, activeBottom, activeSector } from "@/lib/ui/nav";

describe("navigation", () => {
  it("phone bar has Painel, Família, Casa, Finanças and Mais", () => {
    expect(BOTTOM_BAR.map((e) => e.label)).toEqual(["Painel", "Família", "Casa", "Finanças", "Mais"]);
  });

  it("Mais holds what the bar leaves out", () => {
    expect(MORE_ENTRIES.map((e) => e.href)).toEqual(["/caes", "/carros", "/agenda", "/hoje", "/agentes", "/usuarios"]);
  });

  it("panel is active only on /", () => {
    expect(activeSector("/")).toBe("painel");
    expect(activeSector("/familia/abc")).toBe("familia");
    expect(activeSector("/financas/contas/conta-corrente")).toBe("financas");
    expect(activeSector("/casas")).toBeNull();
  });

  it("pages behind Mais light up Mais on the phone", () => {
    expect(activeBottom("/caes/x")).toBe("mais");
    expect(activeBottom("/agenda")).toBe("mais");
    expect(activeBottom("/hoje")).toBe("mais");
    expect(activeBottom("/usuarios")).toBe("mais");
    expect(activeBottom("/mais")).toBe("mais");
    expect(activeBottom("/casa")).toBe("casa");
    expect(activeBottom("/login")).toBeNull();
  });
});
