import { randomUUID } from "node:crypto";
import type { Statement, SystemSql } from "@/lib/db/client";
import type { AccountUser } from "@/lib/auth/types";
import { SESSION_DAYS } from "@/lib/auth/token";
import { TRIAL_DAYS } from "@/lib/tenant/scope";
import { familySeedStatements } from "@/lib/repositories/family-seed";

/**
 * Identity: accounts, sessions and family membership. These run on the owner connection
 * (no family yet, a person is being found), so every statement here is explicit about which person or family.
 */
type Sql = SystemSql;

const ACCOUNT_SELECT = `
  SELECT u.id, u.username,
         CASE fa.role WHEN 'owner' THEN 'admin' WHEN 'member' THEN 'member' ELSE u.role END AS role,
         u.must_change_password, u.password_is_default,
         fa.family_id, fa.role AS family_role, f.name AS family_name, f.never_expires, f.trial_ends_at
  FROM users u
  LEFT JOIN family_accounts fa ON fa.user_id = u.id
  LEFT JOIN families f ON f.id = fa.family_id`;

export async function findUserByPassword(
  sql: Sql,
  username: string,
  password: string,
): Promise<AccountUser | null> {
  const rows = await sql.query(
    `${ACCOUNT_SELECT} WHERE u.username = $1 AND u.password_hash = crypt($2, u.password_hash)`,
    [username, password],
  );
  return mapUser(rows[0]);
}

export async function findUserByUsername(sql: Sql, username: string): Promise<AccountUser | null> {
  const rows = await sql.query(`${ACCOUNT_SELECT} WHERE u.username = $1`, [username]);
  return mapUser(rows[0]);
}

/** The people of one family, owners first. */
export async function listFamilyUsers(sql: Sql, familyId: string): Promise<AccountUser[]> {
  const rows = await sql.query(
    `${ACCOUNT_SELECT} WHERE fa.family_id = $1::uuid ORDER BY (fa.role = 'owner') DESC, u.username`,
    [familyId],
  );
  return rows.map((row) => mapUser(row)).filter((user): user is AccountUser => user !== null);
}

export async function countUsers(sql: Sql): Promise<number> {
  const rows = await sql.query<{ n: unknown }>("SELECT count(*)::int AS n FROM users");
  return Number(rows[0]?.n ?? 0);
}

export async function countFamilies(sql: Sql): Promise<number> {
  const rows = await sql.query<{ n: unknown }>("SELECT count(*)::int AS n FROM families");
  return Number(rows[0]?.n ?? 0);
}

/** Creates the first account as owner of the original family, only while there is no account at all (one statement, no race). */
export async function insertFirstUser(sql: Sql, username: string, password: string): Promise<AccountUser | null> {
  const id = randomUUID();
  const inserted = await sql.query(
    `INSERT INTO users (id, username, password_hash, role)
     SELECT $3::uuid, $1, crypt($2, gen_salt('bf')), 'admin'
     WHERE NOT EXISTS (SELECT 1 FROM users)
     RETURNING id`,
    [username, password, id],
  );
  if (inserted.length === 0) return null;
  await sql.query(
    `INSERT INTO family_accounts (user_id, family_id, role)
     SELECT $1::uuid, id, 'owner' FROM families WHERE is_original
     ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );
  return findUserById(sql, id);
}

export async function findUserById(sql: Sql, id: string): Promise<AccountUser | null> {
  const rows = await sql.query(`${ACCOUNT_SELECT} WHERE u.id = $1::uuid`, [id]);
  return mapUser(rows[0]);
}

/** A new person in an existing family, as a member. One transaction: no account without a family. */
export async function insertFamilyUser(sql: Sql, familyId: string, username: string, password: string): Promise<AccountUser> {
  const id = randomUUID();
  await sql.batch(memberStatements({ id, familyId, username, password }));
  const user = await findUserById(sql, id);
  if (!user) throw new Error("User insert returned no row.");
  return user;
}

function memberStatements(input: { id: string; familyId: string; username: string; password: string }): Statement[] {
  return [
    {
      text: `INSERT INTO users (id, username, password_hash, role)
             VALUES ($1::uuid, $2, crypt($3, gen_salt('bf')), 'member')`,
      params: [input.id, input.username, input.password],
    },
    {
      text: "INSERT INTO family_accounts (user_id, family_id, role) VALUES ($1::uuid, $2::uuid, 'member')",
      params: [input.id, input.familyId],
    },
  ];
}

/**
 * Public sign-up: the person, their family (14 days of trial) and the starting data, in one transaction.
 * A taken username rolls everything back (unique violation).
 */
export async function createFamilyWithOwner(
  sql: Sql,
  input: { familyName: string; username: string; password: string },
): Promise<AccountUser> {
  const userId = randomUUID();
  const familyId = randomUUID();
  await sql.batch([
    {
      text: `INSERT INTO users (id, username, password_hash, role)
             VALUES ($1::uuid, $2, crypt($3, gen_salt('bf')), 'admin')`,
      params: [userId, input.username, input.password],
    },
    {
      text: `INSERT INTO families (id, name, trial_ends_at, created_by)
             VALUES ($1::uuid, $2, now() + ($3 * interval '1 day'), $4::uuid)`,
      params: [familyId, input.familyName, TRIAL_DAYS, userId],
    },
    {
      text: "INSERT INTO family_accounts (user_id, family_id, role) VALUES ($1::uuid, $2::uuid, 'owner')",
      params: [userId, familyId],
    },
    ...familySeedStatements(familyId),
  ]);
  const user = await findUserById(sql, userId);
  if (!user) throw new Error("Sign-up returned no row.");
  return user;
}

/** Joins a family through an invite: the invite is spent and the account created in one transaction. */
export async function acceptInvite(
  sql: Sql,
  input: { inviteId: string; familyId: string; username: string; password: string },
): Promise<AccountUser | null> {
  const id = randomUUID();
  const results = await sql.batch([
    {
      text: `UPDATE family_invites SET accepted_at = now()
             WHERE id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
             RETURNING id`,
      params: [input.inviteId],
    },
    ...memberStatements({ id, familyId: input.familyId, username: input.username, password: input.password }),
    { text: "UPDATE family_invites SET accepted_by = $2::uuid WHERE id = $1::uuid", params: [input.inviteId, id] },
  ]);
  if ((results[0] ?? []).length === 0) return null;
  return findUserById(sql, id);
}

export async function updateOwnPassword(
  sql: Sql,
  userId: string,
  nextPassword: string,
  currentPassword: string,
): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE users
     SET password_hash = crypt($2, gen_salt('bf')), must_change_password = false, password_is_default = false
     WHERE id::text = $1 AND password_hash = crypt($3, password_hash)
     RETURNING id`,
    [userId, nextPassword, currentPassword],
  );
  return rows.length > 0;
}

/** An owner resets a password of someone in the SAME family. Returns false for anyone else. */
export async function updateFamilyUserPassword(sql: Sql, familyId: string, userId: string, password: string): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE users
     SET password_hash = crypt($3, gen_salt('bf')), must_change_password = true, password_is_default = false
     WHERE id::text = $2
       AND EXISTS (SELECT 1 FROM family_accounts fa WHERE fa.user_id = users.id AND fa.family_id = $1::uuid)
     RETURNING id`,
    [familyId, userId, password],
  );
  return rows.length > 0;
}

export async function findSessionUser(sql: Sql, tokenHash: string): Promise<AccountUser | null> {
  const rows = await sql.query(
    `${ACCOUNT_SELECT}
     JOIN sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return mapUser(rows[0]);
}

export async function insertSession(sql: Sql, userId: string, tokenHash: string): Promise<void> {
  await sql.query("DELETE FROM sessions WHERE expires_at <= now()");
  await sql.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1::uuid, $2, now() + ($3 * interval '1 day'))`,
    [userId, tokenHash, SESSION_DAYS],
  );
}

export async function deleteSession(sql: Sql, tokenHash: string): Promise<void> {
  await sql.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteOtherSessions(sql: Sql, userId: string, tokenHash: string): Promise<void> {
  await sql.query("DELETE FROM sessions WHERE user_id::text = $1 AND token_hash <> $2", [userId, tokenHash]);
}

export async function deleteUserSessions(sql: Sql, userId: string): Promise<void> {
  await sql.query("DELETE FROM sessions WHERE user_id::text = $1", [userId]);
}

function mapUser(row: Record<string, unknown> | undefined): AccountUser | null {
  if (!row) return null;
  const familyId = row.family_id == null ? null : String(row.family_id);
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role === "admin" ? "admin" : "member",
    mustChangePassword: row.must_change_password === true,
    passwordIsDefault: row.password_is_default === true,
    family: familyId
      ? {
          familyId,
          familyName: String(row.family_name ?? ""),
          role: row.family_role === "owner" ? "owner" : "member",
          neverExpires: row.never_expires === true,
          trialEndsAt: row.trial_ends_at == null ? null : row.trial_ends_at instanceof Date ? row.trial_ends_at.toISOString() : String(row.trial_ends_at),
        }
      : null,
  };
}
