import { describe, expect, it } from "vitest";
import { installOffer } from "@/lib/ui/pwa";

const ready = { standalone: false, dismissed: false, canPrompt: true, ios: false };

describe("install offer", () => {
  it("gives Android a button and iOS the share steps", () => {
    expect(installOffer({ ...ready, place: "banner" })).toBe("button");
    expect(installOffer({ ...ready, canPrompt: false, ios: true, place: "menu" })).toBe("ios");
    expect(installOffer({ ...ready, canPrompt: false, place: "banner" })).toBe("none");
  });

  it("stays quiet once the app is installed, and the banner can be dismissed", () => {
    expect(installOffer({ ...ready, standalone: true, place: "menu" })).toBe("none");
    expect(installOffer({ ...ready, dismissed: true, place: "banner" })).toBe("none");
    expect(installOffer({ ...ready, dismissed: true, place: "menu" })).toBe("button");
  });
});
