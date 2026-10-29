import { describe, expect, test } from "vitest";
import {
  agendaWindow,
  buildAuthUrl,
  formatOffset,
  googleRedirectUri,
  isGoogleAuthUrl,
  mapGoogleEvent,
  parseAgendaCreate,
  parseWithinDays,
  readGoogleConfig,
  sortAgenda,
  toGoogleEventBody,
  zonedToOffsetIso,
  type AgendaEvent,
} from "@/lib/domain/calendar";
import { agendaDayKey, agendaTimeLabel } from "@/lib/ui/agenda";

const ZONE = "America/Sao_Paulo";

describe("google agenda config", () => {
  test("reads the OAuth client only when both values are a single token", () => {
    expect(readGoogleConfig({})).toBeNull();
    expect(readGoogleConfig({ GOOGLE_CLIENT_ID: "abc", GOOGLE_CLIENT_SECRET: "" })).toBeNull();
    expect(readGoogleConfig({ GOOGLE_CLIENT_ID: "abc def", GOOGLE_CLIENT_SECRET: "secret" })).toBeNull();
    expect(readGoogleConfig({ GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" })).toEqual({
      clientId: "client",
      clientSecret: "secret",
    });
  });

  test("builds an offline consent URL with PKCE and the callback on this app", () => {
    expect(googleRedirectUri("https://casa.example/")).toBe("https://casa.example/api/google/callback");
    const url = buildAuthUrl({
      clientId: "client",
      redirectUri: "https://casa.example/api/google/callback",
      state: "state",
      codeChallenge: "challenge",
    });
    expect(isGoogleAuthUrl(url)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("scope")).toContain("calendar.events");
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("redirect_uri")).toBe("https://casa.example/api/google/callback");
    expect(url.startsWith("https://accounts.google.com/")).toBe(true);
  });
});

describe("agenda times", () => {
  test("São Paulo is three hours behind UTC", () => {
    expect(formatOffset(ZONE, new Date("2026-11-02T18:00:00Z"))).toBe("-03:00");
    expect(zonedToOffsetIso("2026-11-02", "15:00", ZONE)).toBe("2026-11-02T15:00:00-03:00");
    expect(Date.parse(zonedToOffsetIso("2026-11-02", "15:00", ZONE))).toBe(Date.parse("2026-11-02T18:00:00Z"));
  });

  test("the window is from today through the next N midnights", () => {
    expect(agendaWindow("2026-11-02", 14, ZONE)).toEqual({
      timeMin: "2026-11-02T00:00:00-03:00",
      timeMax: "2026-11-16T00:00:00-03:00",
    });
    expect(parseWithinDays(undefined)).toEqual({ ok: true, value: 14 });
    expect(parseWithinDays("7")).toEqual({ ok: true, value: 7 });
    expect(parseWithinDays(0).ok).toBe(false);
    expect(parseWithinDays(31).ok).toBe(false);
  });
});

describe("parseAgendaCreate", () => {
  test("a date is the whole day and a clock time lasts one hour unless told otherwise", () => {
    expect(parseAgendaCreate({ title: " Dentista ", starts_at: "2026-11-02" }, ZONE)).toEqual({
      ok: true,
      value: {
        title: "Dentista",
        all_day: true,
        starts_at: "2026-11-02",
        ends_at: null,
        description: null,
        location: null,
        external_key: null,
      },
    });
    const timed = parseAgendaCreate({ title: "Dentista", starts_at: "2026-11-02T15:00", location: "Centro" }, ZONE);
    expect(timed).toMatchObject({
      ok: true,
      value: { all_day: false, starts_at: "2026-11-02T15:00:00-03:00", ends_at: "2026-11-02T16:00:00-03:00", location: "Centro" },
    });
  });

  test("an all-day end is the last day, inclusive, and a timed end must be later", () => {
    const ranged = parseAgendaCreate({ title: "Viagem", starts_at: "2026-11-02", ends_at: "2026-11-04" }, ZONE);
    expect(ranged.ok && ranged.value.ends_at).toBe("2026-11-04");
    if (ranged.ok) {
      expect(toGoogleEventBody(ranged.value, ZONE)).toMatchObject({ start: { date: "2026-11-02" }, end: { date: "2026-11-05" } });
    }
    expect(parseAgendaCreate({ title: "Dentista", starts_at: "2026-11-02T15:00", ends_at: "2026-11-02T14:00" }, ZONE).ok).toBe(false);
    expect(parseAgendaCreate({ title: "Dentista", starts_at: "2026-11-02", ends_at: "2026-11-02T15:00" }, ZONE).ok).toBe(false);
    expect(parseAgendaCreate({ title: "", starts_at: "2026-11-02", surprise: true }, ZONE).ok).toBe(false);
  });
});

describe("mapGoogleEvent", () => {
  test("keeps confirmed events, drops cancelled ones, and refuses a non-https link", () => {
    const allDay = mapGoogleEvent({
      id: "a",
      status: "confirmed",
      summary: "Dentista",
      start: { date: "2026-11-02" },
      end: { date: "2026-11-03" },
      htmlLink: "https://www.google.com/calendar/event?eid=abc",
    }, "pessoa");
    expect(allDay).toMatchObject({ id: "a", title: "Dentista", all_day: true, starts_at: "2026-11-02", ends_at: null, owner: "pessoa" });
    expect(mapGoogleEvent({ id: "b", status: "cancelled", start: { date: "2026-11-02" } }, "pessoa")).toBeNull();
    expect(mapGoogleEvent({ id: "c", summary: "X", start: { dateTime: "2026-11-02T15:00:00-03:00" }, htmlLink: "javascript:alert(1)" }, "pessoa")?.html_link).toBeNull();
  });

  test("sorts by start and labels the day in the house zone", () => {
    const later = event({ id: "2", starts_at: "2026-11-02T18:00:00-03:00", all_day: false });
    const earlier = event({ id: "1", starts_at: "2026-11-02", all_day: true });
    expect(sortAgenda([later, earlier]).map((item) => item.id)).toEqual(["1", "2"]);
    expect(agendaDayKey(earlier, ZONE)).toBe("2026-11-02");
    expect(agendaDayKey(later, ZONE)).toBe("2026-11-02");
    expect(agendaTimeLabel(earlier, ZONE)).toBe("Dia inteiro");
    expect(agendaTimeLabel(later, ZONE)).toBe("18:00");
  });
});

function event(over: Partial<AgendaEvent>): AgendaEvent {
  return {
    id: "1",
    title: "Dentista",
    starts_at: "2026-11-02",
    ends_at: null,
    all_day: true,
    location: null,
    html_link: null,
    owner: "pessoa",
    ...over,
  };
}
