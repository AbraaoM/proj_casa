import { DatabaseUnavailableError, getSql, type Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { isUuid } from "@/lib/domain/dates";
import { AppError, notFound, type FieldError } from "@/lib/errors";

export function jsonOk(data: unknown, meta: Record<string, unknown> = {}, status = 200): Response {
  return Response.json({ ok: true, data, meta }, { status });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: FieldError[],
): Response {
  return Response.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("validation_error", "Request body must be JSON.", 400);
  }
}

export function requireSql(): Sql {
  try {
    return getSql();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      throw new AppError("database_unavailable", "DATABASE_URL is not set.", 503);
    }
    throw error;
  }
}

export async function requireId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!isUuid(id)) throw notFound();
  return id;
}

/** A house area is addressed by uuid or by slug. */
export async function requireAreaRef(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!isUuid(id) && !/^[a-z0-9_]{1,40}$/.test(id)) throw notFound("Area was not found.");
  return id;
}

/** Today in the household's time zone. */
export async function householdToday(sql: Sql): Promise<string> {
  const { readSettings } = await import("@/lib/services/settings");
  const { todayInTimeZone } = await import("@/lib/domain/dates");
  const settings = await readSettings(sql);
  return todayInTimeZone(settings.timezone);
}

export function toErrorResponse(error: unknown): Response {
  const body = errorBody(error);
  const status =
    error instanceof AppError
      ? error.status
      : body.code === "database_unavailable"
        ? 503
        : 500;
  if (status === 500) console.error(error);
  return jsonError(body.code, body.message, status, body.details);
}

export function errorBody(error: unknown): { code: string; message: string; details?: FieldError[] } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof DatabaseUnavailableError) {
    return { code: "database_unavailable", message: "DATABASE_URL is not set." };
  }
  if (isMissingSchema(error)) {
    return {
      code: "database_unavailable",
      message: "Database schema is not applied. Run npm run db:migrate.",
    };
  }
  return { code: "internal_error", message: "Unexpected server error." };
}

export async function run(request: Request, action: () => Promise<Response>): Promise<Response> {
  const { authorize } = await import("@/lib/agent/auth");
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    return await action();
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** A finance account, category or bill is addressed by uuid or by slug. */
export async function requireRef(params: Promise<{ id: string }>, label = "Record"): Promise<string> {
  const { id } = await params;
  if (!isUuid(id) && !/^[a-z0-9_]{1,40}$/.test(id)) throw notFound(`${label} was not found.`);
  return id;
}

/** Runs a bulk request: each entry parsed and handled on its own, with its own ok. */
export async function bulkResults<T>(
  items: unknown[],
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; details: FieldError[] },
  handle: (value: T) => Promise<{ data: unknown; idempotentReplay: boolean }>,
): Promise<Response> {
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const parsed = parse(items[index]);
    if (!parsed.ok) {
      results.push({
        index,
        ok: false,
        error: { code: "validation_error", message: parsed.details[0]?.message ?? "Invalid entry.", details: parsed.details },
      });
      continue;
    }
    try {
      const done = await handle(parsed.value);
      results.push({ index, ok: true, data: done.data, meta: { idempotent_replay: done.idempotentReplay } });
    } catch (error) {
      const body = errorBody(error);
      if (body.code === "internal_error") console.error(error);
      results.push({ index, ok: false, error: body });
    }
  }
  const succeeded = results.filter((result) => result.ok).length;
  return jsonOk({ results }, { succeeded, failed: results.length - succeeded });
}

export function invalid(details: FieldError[], fallback = "Invalid request."): AppError {
  return new AppError("validation_error", details[0]?.message ?? fallback, 400, details);
}
