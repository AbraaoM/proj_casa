export type AccountResult<T> = { ok: true; value: T } | { ok: false; message: string };

const USERNAME = /^[a-z0-9_]{3,32}$/;

export function parseUsername(value: unknown): AccountResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "Informe o usuário." };
  }
  const username = value.trim().toLowerCase();
  if (!USERNAME.test(username)) {
    return {
      ok: false,
      message: "O usuário precisa ter de 3 a 32 caracteres: letras minúsculas, números e _.",
    };
  }
  return { ok: true, value: username };
}

export function parsePassword(value: unknown): AccountResult<string> {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, message: "Informe a senha." };
  }
  if (value.length < 4 || Buffer.byteLength(value) > 72) {
    return { ok: false, message: "A senha precisa ter entre 4 e 72 caracteres." };
  }
  return { ok: true, value };
}

export const MIN_NEW_PASSWORD = 8;

/** A password being set now: at least 8 characters. Sign-in still accepts older, shorter ones. */
export function parseNewPassword(value: unknown): AccountResult<string> {
  const parsed = parsePassword(value);
  if (!parsed.ok) return parsed;
  if (parsed.value.length < MIN_NEW_PASSWORD) {
    return { ok: false, message: `A nova senha precisa ter pelo menos ${MIN_NEW_PASSWORD} caracteres.` };
  }
  return parsed;
}

export function parsePasswordPair(password: unknown, confirm: unknown): AccountResult<string> {
  const parsed = parseNewPassword(password);
  if (!parsed.ok) return parsed;
  if (password !== confirm) return { ok: false, message: "As senhas não coincidem." };
  return parsed;
}

export function parseLogin(
  username: unknown,
  password: unknown,
): AccountResult<{ username: string; password: string }> {
  const parsedUsername = parseUsername(username);
  if (!parsedUsername.ok) return parsedUsername;
  const parsedPassword = parsePassword(password);
  if (!parsedPassword.ok) return parsedPassword;
  return {
    ok: true,
    value: { username: parsedUsername.value, password: parsedPassword.value },
  };
}
