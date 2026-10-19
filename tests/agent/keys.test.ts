import { createHash } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { authorize } from "@/lib/agent/auth";
import { decideAgentAccess, hashAgentKey, newAgentKey, parseAgentLabel } from "@/lib/agent/keys";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("agent key material", () => {
  test("issues a casa_ secret, a 12-character prefix, and the sha256 of the secret", () => {
    const key = newAgentKey();

    expect(key.token.startsWith("casa_")).toBe(true);
    expect(key.token.slice("casa_".length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key.prefix).toBe(key.token.slice(0, 12));
    expect(key.hash).toBe(createHash("sha256").update(key.token).digest("hex"));
    expect(key.hash).not.toContain(key.token);
  });

  test("two generated secrets differ", () => {
    expect(newAgentKey().token).not.toBe(newAgentKey().token);
  });

  test("hashes the same secret to the same value", () => {
    expect(hashAgentKey("casa_abc")).toBe(hashAgentKey("casa_abc"));
    expect(hashAgentKey("casa_abc")).not.toBe(hashAgentKey("casa_abd"));
  });
});

describe("agent key label", () => {
  test("trims a usable name", () => {
    expect(parseAgentLabel("  Agente  ")).toEqual({ ok: true, value: "Agente" });
  });

  test("rejects an empty name", () => {
    const result = parseAgentLabel("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("O nome precisa ter entre 1 e 64 caracteres.");
  });

  test("rejects a name longer than 64 characters", () => {
    expect(parseAgentLabel("a".repeat(65)).ok).toBe(false);
  });
});

describe("decideAgentAccess", () => {
  const closed = { available: false, hasActiveKey: false, hashMatches: false };

  test("accepts the environment secret while the database is down", () => {
    expect(
      decideAgentAccess({
        presented: "env-secret",
        envKey: "env-secret",
        database: closed,
      }),
    ).toBe("allow");
  });

  test("rejects a wrong secret when only the environment key exists", () => {
    expect(
      decideAgentAccess({
        presented: "other",
        envKey: "env-secret",
        database: closed,
      }),
    ).toBe("unauthorized");
  });

  test("reports unconfigured when nothing is set and no token arrives", () => {
    expect(decideAgentAccess({ presented: "", envKey: "  ", database: closed })).toBe("agent_not_configured");
  });

  test("reports unconfigured when the database is up and has no active key", () => {
    expect(
      decideAgentAccess({
        presented: "casa_nope",
        envKey: "",
        database: { available: true, hasActiveKey: false, hashMatches: false },
      }),
    ).toBe("agent_not_configured");
  });

  test("accepts a stored key when the environment variable is empty", () => {
    expect(
      decideAgentAccess({
        presented: "casa_live",
        envKey: "",
        database: { available: true, hasActiveKey: true, hashMatches: true },
      }),
    ).toBe("allow");
  });

  test("rejects an unknown secret when an active key exists", () => {
    expect(
      decideAgentAccess({
        presented: "casa_live",
        envKey: "",
        database: { available: true, hasActiveKey: true, hashMatches: false },
      }),
    ).toBe("unauthorized");
  });

  test("accepts a stored key that does not match the environment secret", () => {
    expect(
      decideAgentAccess({
        presented: "casa_live",
        envKey: "env-secret",
        database: { available: true, hasActiveKey: true, hashMatches: true },
      }),
    ).toBe("allow");
  });

  test("ignores a database match when the database is unavailable", () => {
    expect(
      decideAgentAccess({
        presented: "casa_live",
        envKey: "",
        database: { available: false, hasActiveKey: true, hashMatches: true },
      }),
    ).toBe("agent_not_configured");
  });
});

describe("authorize", () => {
  function request(authorization?: string): Request {
    const headers = new Headers();
    if (authorization !== undefined) headers.set("authorization", authorization);
    return new Request("http://localhost/api/agent/health", { headers });
  }
  const owner = { userId: "u-owner", username: "dono", keyId: null, agentName: null };
  const denied = (result: Awaited<ReturnType<typeof authorize>>) => (result.ok ? null : result.response);

  test("accepts the environment secret without asking the database, acting as the first master account", async () => {
    vi.stubEnv("AGENT_API_KEY", "env-secret");
    const lookup = vi.fn();

    const result = await authorize(request("Bearer env-secret"), lookup, async () => owner);

    expect(result).toEqual({ ok: true, caller: owner });
    expect(lookup).not.toHaveBeenCalled();
  });

  test("the environment secret still works when the owner lookup fails", async () => {
    vi.stubEnv("AGENT_API_KEY", "env-secret");
    const result = await authorize(request("Bearer env-secret"), vi.fn(), async () => {
      throw new Error("db down");
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.caller.userId).toBeNull();
  });

  test("accepts a bearer token whose hash matches an active key and says who it belongs to", async () => {
    vi.stubEnv("AGENT_API_KEY", "");
    const token = "casa_live";
    const caller = { userId: "u1", username: "pessoa", keyId: "k1", agentName: "Agente da casa" };
    const result = await authorize(request(`Bearer ${token}`), async (keyHash) => {
      expect(keyHash).toBe(hashAgentKey(token));
      return { available: true, hasActiveKey: true, hashMatches: true, caller };
    });

    expect(result).toEqual({ ok: true, caller });
  });

  test("returns 401 when the bearer token matches nothing", async () => {
    vi.stubEnv("AGENT_API_KEY", "env-secret");
    const lookup = vi.fn(async () => ({
      available: true,
      hasActiveKey: true,
      hashMatches: false,
    }));
    const response = denied(await authorize(request("Bearer wrong"), lookup));

    expect(lookup).toHaveBeenCalledOnce();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  test("returns 503 when no key is configured", async () => {
    vi.stubEnv("AGENT_API_KEY", "");
    const lookup = vi.fn(async () => ({
      available: true,
      hasActiveKey: false,
      hashMatches: false,
    }));
    const response = denied(await authorize(request(), lookup));

    expect(lookup).toHaveBeenCalledOnce();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "agent_not_configured" },
    });
  });

  test("treats a missing agent_keys table as no configured key", async () => {
    vi.stubEnv("AGENT_API_KEY", "");
    const error = Object.assign(new Error('relation "agent_keys" does not exist'), { code: "42P01" });
    const lookup = vi.fn(async () => {
      throw error;
    });
    const response = denied(await authorize(request("Bearer casa_live"), lookup));

    expect(lookup).toHaveBeenCalledOnce();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "agent_not_configured" },
    });
  });

  test("returns 503 when the key lookup fails for another reason", async () => {
    vi.stubEnv("AGENT_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = denied(
      await authorize(request("Bearer casa_live"), async () => {
        throw new Error("connection reset");
      }),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "database_unavailable" },
    });
  });
});
