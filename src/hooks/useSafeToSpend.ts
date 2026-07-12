import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { computeSafeToSpend, type SafeToSpendResult } from '@engine/safeToSpend'
import { isoWeekStart, isoWeekEnd } from '@lib/dates'
import type { Transaction } from '@db/types'

// A transaction draws down the personal safe-to-spend pool only if it is a
// plain outgoing spend: not a transfer, not pass-through, and not tagged as a
// committed recurring payment (bills/subs live in the recurring bucket, which
// the allowance is already net of — see computeSafeToSpend).
export function isWeekDraw(t: Transaction): boolean {
  return (
    t.direction === 'out' &&
    !t.is_transfer &&
    t.lane !== 'pass_through' &&
    t.recurring_item_id === null
  )
}

export function useSafeToSpend(): { result: SafeToSpendResult | null; isLoading: boolean } {
  const data = useLiveQuery(async () => {
    const allowance = await db.allowance.get('local')
    if (!allowance || allowance.monthly_amount === 0) return null

    const today = new Date()
    const weekStart = isoWeekStart(today)
    const weekEnd = isoWeekEnd(today)

    const [activeRecurringItems, weekTxns] = await Promise.all([
      db.recurringItems.filter((r) => r.is_active).toArray(),
      db.transactions
        .where('date')
        .between(weekStart, weekEnd, true, true)
        .filter(isWeekDraw)
        .toArray(),
    ])

    const spendThisWeek = weekTxns.reduce((s, t) => s + t.amount, 0)

    return computeSafeToSpend({ allowance, activeRecurringItems, spendThisWeek, today })
  })

  return {
    result: data ?? null,
    isLoading: data === undefined,
  }
}
