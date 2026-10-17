export type AccountRole = "admin" | "member";

export type AccountUser = {
  id: string;
  username: string;
  role: AccountRole;
};

export type FormState = {
  ok: boolean;
  message: string;
};

export const idleForm: FormState = { ok: false, message: "" };
