import type { Sql } from "@/lib/db/client";
import { parseStoredClose, type MonthClose } from "@/lib/domain/finance/close";

function monthDate(month: string): string {
  return `${month}-01`;
}

export async function getMonthClose(sql: Sql, month: string): Promise<MonthClose | null> {
  const rows = await sql.query<{ snapshot: unknown }>("SELECT snapshot FROM fin_month_closes WHERE month = $1::date", [monthDate(month)]);
  const snapshot = rows[0]?.snapshot;
  if (snapshot === undefined) return null;
  const value = typeof snapshot === "string" ? JSON.parse(snapshot) as unknown : snapshot;
  return parseStoredClose(value);
}

export async function listClosedMonths(sql: Sql, months: readonly string[]): Promise<string[]> {
  if (months.length === 0) return [];
  const rows = await sql.query<{ month: string }>(
    "SELECT to_char(month, 'YYYY-MM') AS month FROM fin_month_closes WHERE month = ANY($1::date[])",
    [months.map(monthDate)],
  );
  return rows.map((row) => row.month);
}

export async function saveMonthClose(sql: Sql, close: MonthClose): Promise<void> {
  await sql.query(
    `INSERT INTO fin_month_closes (month, closed_on, snapshot)
     VALUES ($1::date, $2::date, $3::jsonb)
     ON CONFLICT (month) DO UPDATE
       SET closed_on = EXCLUDED.closed_on, snapshot = EXCLUDED.snapshot, updated_at = now()`,
    [monthDate(close.month), close.closed_on, JSON.stringify(close)],
  );
}
