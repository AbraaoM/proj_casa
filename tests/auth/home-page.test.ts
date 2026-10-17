import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountUser } from "@/lib/auth/types";

const state = vi.hoisted(() => ({ user: null as AccountUser | null }));
const loadDashboard = vi.hoisted(() => vi.fn(async () => ({ status: "ready" })));

vi.mock("@/lib/auth/session", () => ({ currentUser: async () => state.user }));
vi.mock("@/lib/services/dashboard", () => ({ loadDashboard }));

const { default: HomePage } = await import("@/app/page");
const { Landing } = await import("@/components/landing/landing");
const { AppShell } = await import("@/components/nav/app-shell");

describe("/ by session", () => {
  beforeEach(() => {
    loadDashboard.mockClear();
  });

  it("without a valid session shows the landing and never loads the dashboard", async () => {
    state.user = null;
    const page = await HomePage();
    expect(page.type).toBe(Landing);
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  it("with a session shows the app shell with the dashboard", async () => {
    state.user = { id: "u1", username: "pai", role: "admin" } as AccountUser;
    const page = await HomePage();
    expect(page.type).toBe(AppShell);
    expect(loadDashboard).toHaveBeenCalledTimes(1);
  });
});
