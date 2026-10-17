export function isUniqueViolation(error: unknown): boolean {
  return readCode(error) === "23505";
}

export function isMissingSchema(error: unknown): boolean {
  if (readCode(error) === "42P01") return true;
  const message = readMessage(error).toLowerCase();
  return message.includes("does not exist") && message.includes("relation");
}

function readCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return readCode(error.cause);
  return undefined;
}

function readMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const own = "message" in error ? String(error.message) : "";
  const cause = "cause" in error ? readMessage(error.cause) : "";
  return `${own} ${cause}`;
}
