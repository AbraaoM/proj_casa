import { existsSync, readFileSync } from "node:fs";
import { createSql } from "../lib/db/client";
import { applyMigrations } from "../lib/db/migrate";

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Add it to .env.local and run npm run db:migrate again.");
    process.exit(1);
  }

  const sql = createSql(databaseUrl);
  const applied = await applyMigrations(sql, { log: (line) => console.log(line) });
  if (applied.length === 0) console.log("Schema already up to date.");
  if (process.env.DATABASE_DRIVER === "pg") process.exit(0);
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
