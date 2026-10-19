import { existsSync, readFileSync } from "node:fs";
import { createSql } from "../lib/db/client";
import { applyMigrations } from "../lib/db/migrate";
import { parseNewPassword, parseUsername } from "../lib/auth/validate";
import { insertFirstUser } from "../lib/repositories/accounts";

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
  await seedFirstAccount(sql);
  if (process.env.DATABASE_DRIVER === "pg") process.exit(0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Migration failed.";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***"));
  process.exit(1);
});

/** Optional: CASA_FIRST_USERNAME and CASA_FIRST_PASSWORD create the first master account if there is none. */
async function seedFirstAccount(sql: ReturnType<typeof createSql>) {
  const rawUser = process.env.CASA_FIRST_USERNAME;
  const rawPassword = process.env.CASA_FIRST_PASSWORD;
  if (!rawUser && !rawPassword) return;
  const username = parseUsername(rawUser);
  const password = parseNewPassword(rawPassword);
  if (!username.ok || !password.ok) {
    console.error(`First account not created: ${!username.ok ? username.message : (password as { message: string }).message}`);
    process.exit(1);
  }
  const user = await insertFirstUser(sql, username.value, password.value);
  console.log(user ? `First account ${user.username} created (master).` : "An account already exists; nothing seeded.");
}

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
