import { neon } from "@neondatabase/serverless";

export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
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
 */
export function createSql(databaseUrl: string): Sql {
  if (process.env.DATABASE_DRIVER === "pg") return createPgSql(databaseUrl);
  const sql = neon(databaseUrl);
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const rows = await sql.query(text, params);
      return rows as T[];
    },
  };
}

type PgPool = { query(text: string, params: unknown[]): Promise<{ rows: unknown[] }> };
const pgPools = new Map<string, Promise<PgPool>>();

function createPgSql(databaseUrl: string): Sql {
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      let pool = pgPools.get(databaseUrl);
      if (!pool) {
        pool = import("pg").then(({ default: pg }) => {
          // Keep DATE columns as YYYY-MM-DD strings, like calendar days in the app.
          pg.types.setTypeParser(1082, (value: string) => value);
          return new pg.Pool({ connectionString: databaseUrl, max: 5 }) as unknown as PgPool;
        });
        pgPools.set(databaseUrl, pool);
      }
      const result = await (await pool).query(text, params);
      return result.rows as T[];
    },
  };
}

export function getSql(): Sql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DatabaseUnavailableError();
  return createSql(databaseUrl);
}

export function tryGetSql(): Sql | null {
  if (!process.env.DATABASE_URL) return null;
  return getSql();
}
