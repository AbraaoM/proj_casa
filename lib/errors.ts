export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "database_unavailable"
  | "agent_not_configured"
  | "agenda_not_connected"
  | "agenda_unavailable"
  | "internal_error";

export type FieldError = { field: string; message: string };

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: FieldError[];

  constructor(code: ErrorCode, message: string, status: number, details?: FieldError[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function validationError(message: string, details: FieldError[]): AppError {
  return new AppError("validation_error", message, 400, details);
}

export function notFound(message = "Record was not found."): AppError {
  return new AppError("not_found", message, 404);
}
