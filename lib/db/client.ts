import { neon } from "@neondatabase/serverless";

export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type Statement = { text: string; params?: unknown[] };

/** A connection as the table owner: it bypasses row level security. Only identity code and tenant.ts use it. */
export type SystemSql = Sql & {
  /** Runs the statements in one transaction and returns each one's rows. */
  batch(statements: Statement[]): Promise<Record<string, unknown>[][]>;
};

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set.");
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Neon (HTTP) is the default driver. `DATABASE_DRIVER=pg` switches to node-postgres,
 * which is only meant for a local Postgres during development and tests.
 *
 * This is the owner connection (no family). The app reads and writes business data only through
 * getSql() (lib/db/tenant.ts), which scopes every query to one family.
 */
export function createSql(databaseUrl: string): SystemSql {
  if (process.env.DATABASE_DRIVER === "pg") return createPgSql(databaseUrl);
  const sql = neon(databaseUrl);
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const rows = await sql.query(text, params);
      return rows as T[];
    },
    async batch(statements: Statement[]) {
      const results = await sql.transaction((txn) => statements.map((statement) => txn.query(statement.text, statement.params ?? [])));
      return results as Record<string, unknown>[][];
    },
  };
}

type PgClient = { query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>; release(error?: boolean): void };
type PgPool = {
  query(text: string, params: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<PgClient>;
};
const pgPools = new Map<string, Promise<PgPool>>();

function createPgSql(databaseUrl: string): SystemSql {
  const pool = (): Promise<PgPool> => {
    let existing = pgPools.get(databaseUrl);
    if (!existing) {
      existing = import("pg").then(({ default: pg }) => {
        // Keep DATE columns as YYYY-MM-DD strings, like calendar days in the app.
        pg.types.setTypeParser(1082, (value: string) => value);
        return new pg.Pool({ connectionString: databaseUrl, max: 5 }) as unknown as PgPool;
      });
      pgPools.set(databaseUrl, existing);
    }
    return existing;
  };
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const result = await (await pool()).query(text, params);
      return result.rows as T[];
    },
    async batch(statements: Statement[]) {
      const client = await (await pool()).connect();
      try {
        await client.query("BEGIN");
        const results: Record<string, unknown>[][] = [];
        for (const statement of statements) {
          const result = await client.query(statement.text, statement.params ?? []);
          results.push(result.rows as Record<string, unknown>[]);
        }
        await client.query("COMMIT");
        return results;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original error is the one that matters.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** The owner connection, for identity code (accounts, sessions, keys, invites, cron discovery). Never for business data. */
export function getSystemSql(): SystemSql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DatabaseUnavailableError();
  return createSql(databaseUrl);
}

export function tryGetSystemSql(): SystemSql | null {
  if (!process.env.DATABASE_URL) return null;
  return getSystemSql();
}

// Business data access lives in lib/db/tenant.ts. Re-exported so call sites keep one import.
export { getSql, tryGetSql } from "@/lib/db/tenant";
