import type { TenantScope } from "@/lib/tenant/scope";

/** admin = owner of the family (invites people, resets passwords). member = uses the house. */
export type AccountRole = "admin" | "member";

export type AccountUser = {
  id: string;
  username: string;
  role: AccountRole;
  /** Set on an account still on the initial password or reset by a master account. */
  mustChangePassword?: boolean;
  /** The account still uses the initial password of old installs ("admin"). */
  passwordIsDefault?: boolean;
  /** The one family this person belongs to. Null only for an account that is not attached to a family. */
  family?: TenantScope | null;
};

export type FormState = {
  ok: boolean;
  message: string;
};

export const idleForm: FormState = { ok: false, message: "" };
