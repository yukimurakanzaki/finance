import { db } from '@db/db'
import {
  type DailyLeftoverResult,
  computeDailyLeftover,
  monthStartOf,
} from '@engine/dailyLeftover'
import { useLiveQuery } from 'dexie-react-hooks'

/**
 * Live-query wrapper around `computeDailyLeftover` — matches the return shape
 * of `useSafeToSpend` so callers can destructure `{ result, isLoading }` the
 * same way.
 *
 * @param day YYYY-MM-DD — the day being viewed (same `day` state TodayScreen
 *   tracks for its date navigator). When the user navigates days, the leftover
 *   and projection flag update reactively.
 */
export function useDailyLeftover(day: string): {
  result: DailyLeftoverResult | null
  isLoading: boolean
} {
  const data = useLiveQuery(async () => {
    const allowance = await db.allowance.get('local')
    if (!allowance || allowance.monthly_amount === 0) return null

    const monthStart = monthStartOf(day)
    // Last day of the month: go to next month's 0th day.
    const [y, m] = monthStart.split('-').map(Number) as [number, number]
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${monthStart.slice(0, 8)}${String(lastDay).padStart(2, '0')}`

    const transactions = await db.transactions
      .where('date')
      .between(monthStart, monthEnd, true, true)
      .toArray()

    return computeDailyLeftover({
      monthlyAmount: allowance.monthly_amount,
      transactions,
      asOfDate: day,
    })
  }, [day])

  return {
    result: data ?? null,
    isLoading: data === undefined,
  }
}
