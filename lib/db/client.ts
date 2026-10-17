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

export function createSql(databaseUrl: string): Sql {
  const sql = neon(databaseUrl);
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const rows = await sql.query(text, params);
      return rows as T[];
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
