import type { Transaction } from '@db/types'

export interface CategoryBreakdownRow {
  id: string
  name: string
  amount: number
}

const UNCATEGORIZED_KEY = '__uncategorized__'

// Groups already-filtered expense transactions by category_id, summing each
// group and sorting descending by amount (F4 — PAIN-POINTS.md Scenario C /
// F4: "the per-category breakdown ... is the missing join" between plan and
// actuals). Pure/DOM-free so it's unit-testable — mirrors the amountFormat.ts
// split (resolveAmount) pattern.
//
// CRITICAL: callers must pass the exact same transaction set ReportScreen sums
// for its displayed "This month — actuals" expense total (see ReportScreen.tsx:
// transactionsRepo.getByMonth(ym), filtered to direction === 'out' && !is_transfer)
// so the returned rows reconcile with that total — summing every row's `amount`
// always equals the sum of `expenseTxns`, since this function partitions that
// same array without adding, dropping, or re-filtering any transaction.
//
// Transactions with a null category_id, or a category_id that no longer
// resolves in `catName` (e.g. a deleted category), are bucketed together as
// "Uncategorized" rather than silently dropped or spread across the sum.
export function groupByCategory(
  expenseTxns: Pick<Transaction, 'category_id' | 'amount'>[],
  catName: Map<string, string>,
): CategoryBreakdownRow[] {
  const sums = new Map<string, number>()
  for (const t of expenseTxns) {
    const key =
      t.category_id && catName.has(t.category_id)
        ? t.category_id
        : UNCATEGORIZED_KEY
    sums.set(key, (sums.get(key) ?? 0) + t.amount)
  }
  return Array.from(sums.entries())
    .map(([id, amount]) => ({
      id,
      name:
        id === UNCATEGORIZED_KEY
          ? 'Uncategorized'
          : (catName.get(id) ?? 'Uncategorized'),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
}
