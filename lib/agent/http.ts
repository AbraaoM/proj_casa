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
