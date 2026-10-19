import type { Sql } from "@/lib/db/client";
import type { AccountUser } from "@/lib/auth/types";
import { SESSION_DAYS } from "@/lib/auth/token";

const USER_COLUMNS = "id, username, role, must_change_password, password_is_default";

export async function findUserByPassword(
  sql: Sql,
  username: string,
  password: string,
): Promise<AccountUser | null> {
  const rows = await sql.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE username = $1 AND password_hash = crypt($2, password_hash)`,
    [username, password],
  );
  return mapUser(rows[0]);
}

export async function findUserByUsername(sql: Sql, username: string): Promise<AccountUser | null> {
  const rows = await sql.query(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [username]);
  return mapUser(rows[0]);
}

export async function listUsers(sql: Sql): Promise<AccountUser[]> {
  const rows = await sql.query(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, username`,
  );
  return rows.map((row) => mapUser(row)).filter((user): user is AccountUser => user !== null);
}

export async function countUsers(sql: Sql): Promise<number> {
  const rows = await sql.query<{ n: unknown }>("SELECT count(*)::int AS n FROM users");
  return Number(rows[0]?.n ?? 0);
}

/** Creates the first account as master, only while there is no account at all (one statement, no race). */
export async function insertFirstUser(sql: Sql, username: string, password: string): Promise<AccountUser | null> {
  const rows = await sql.query(
    `INSERT INTO users (username, password_hash, role)
     SELECT $1, crypt($2, gen_salt('bf')), 'admin'
     WHERE NOT EXISTS (SELECT 1 FROM users)
     RETURNING ${USER_COLUMNS}`,
    [username, password],
  );
  return mapUser(rows[0]);
}

export async function insertUser(sql: Sql, username: string, password: string): Promise<AccountUser> {
  const rows = await sql.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, crypt($2, gen_salt('bf')), 'member')
     RETURNING ${USER_COLUMNS}`,
    [username, password],
  );
  const user = mapUser(rows[0]);
  if (!user) throw new Error("User insert returned no row.");
  return user;
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

export async function updateUserPassword(sql: Sql, userId: string, password: string): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE users
     SET password_hash = crypt($2, gen_salt('bf')), must_change_password = true, password_is_default = false
     WHERE id::text = $1
     RETURNING id`,
    [userId, password],
  );
  return rows.length > 0;
}

export async function findSessionUser(sql: Sql, tokenHash: string): Promise<AccountUser | null> {
  const rows = await sql.query(
    `SELECT u.id, u.username, u.role, u.must_change_password, u.password_is_default
     FROM sessions s
     JOIN users u ON u.id = s.user_id
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
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role === "admin" ? "admin" : "member",
    mustChangePassword: row.must_change_password === true,
    passwordIsDefault: row.password_is_default === true,
  };
}
