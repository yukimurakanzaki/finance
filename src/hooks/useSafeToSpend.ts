import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { computeSafeToSpend, isWeekDraw, type SafeToSpendResult } from '@engine/safeToSpend'
import { isoWeekStart, isoWeekEnd } from '@lib/dates'

export { isWeekDraw }

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
