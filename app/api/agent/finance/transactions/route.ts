import { invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseTransactionCreate, parseTransactionListQuery } from "@/lib/domain/finance/validate";
import { createTransaction, listTransactions } from "@/lib/services/finance/transactions";

/** Filters: from, to, month, account, category (children included), kind, status, source, bill, origin, q, limit, offset. */
export async function GET(request: Request) {
  return run(request, async () => {
    const parsed = parseTransactionListQuery(new URL(request.url).searchParams);
    if (!parsed.ok) throw invalid(parsed.details, "Invalid query.");
    const { transactions, total } = await listTransactions(requireSql(), parsed.value);
    const next = parsed.value.offset + transactions.length;
    return jsonOk(
      { transactions },
      { count: transactions.length, total, limit: parsed.value.limit, offset: parsed.value.offset, next_offset: next < total ? next : null },
    );
  });
}

/** One transaction, or N installments with { installments: N } (amount_cents is the total). */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseTransactionCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid transaction.");
    const created = await createTransaction(requireSql(), parsed.value);
    return jsonOk(
      { transaction: created.transactions[0], transactions: created.transactions },
      { idempotent_replay: created.idempotentReplay },
      created.idempotentReplay ? 200 : 201,
    );
  });
}
