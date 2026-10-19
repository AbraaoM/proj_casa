export type AccountRole = "admin" | "member";

export type AccountUser = {
  id: string;
  username: string;
  role: AccountRole;
  /** Set on an account still on the initial password or reset by a master account. */
  mustChangePassword?: boolean;
  /** The account still uses the initial password of old installs ("admin"). */
  passwordIsDefault?: boolean;
};

export type FormState = {
  ok: boolean;
  message: string;
};

export const idleForm: FormState = { ok: false, message: "" };
