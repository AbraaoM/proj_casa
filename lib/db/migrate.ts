import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { pendingVersions } from "@/lib/db/migration-plan";
import { splitSql } from "@/lib/db/split-sql";

export const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

/** Applies pending migrations in order. `until` stops after that version (tests). */
export async function applyMigrations(
  sql: Sql,
  options: { directory?: string; until?: string; log?: (line: string) => void } = {},
): Promise<string[]> {
  const directory = options.directory ?? MIGRATIONS_DIR;
  let applied = new Set<string>();
  try {
    const rows = await sql.query<{ version: string }>("SELECT version FROM schema_migrations");
    applied = new Set(rows.map((row) => String(row.version)));
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
  }

  const pending = pendingVersions(readdirSync(directory), applied).filter(
    (version) => !options.until || version <= options.until,
  );
  for (const version of pending) {
    const source = readFileSync(path.join(directory, `${version}.sql`), "utf8");
    for (const statement of splitSql(source)) {
      await sql.query(statement);
    }
    await sql.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [version]);
    options.log?.(`Applied ${version}.`);
  }
  return pending;
}
