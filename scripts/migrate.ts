import { existsSync, readdirSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { isMissingSchema } from "../lib/db/errors";
import { pendingVersions } from "../lib/db/migration-plan";
import { splitSql } from "../lib/db/split-sql";

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Add it to .env.local and run npm run db:migrate again.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  const directory = new URL("../db/migrations/", import.meta.url);
  const files = readdirSync(directory);
  let applied = new Set<string>();
  try {
    const rows = await sql.query("SELECT version FROM schema_migrations");
    applied = new Set(rows.map((row) => String(row.version)));
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
  }

  const pending = pendingVersions(files, applied);
  if (pending.length === 0) {
    console.log("Schema already up to date.");
    return;
  }

  for (const version of pending) {
    const source = readFileSync(new URL(`${version}.sql`, directory), "utf8");
    for (const statement of splitSql(source)) {
      await sql.query(statement);
    }
    await sql.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [version]);
    console.log(`Applied ${version}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Migration failed.";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***"));
  process.exit(1);
});

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
