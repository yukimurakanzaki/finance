import { db } from '@db/db'
import {
  type DailyLeftoverResult,
  computeDailyLeftover,
} from '@engine/dailyLeftover'
import { useLiveQuery } from 'dexie-react-hooks'

function monthBounds(day: string): { start: string; end: string } {
  const [y, m] = day.split('-').map(Number) as [number, number]
  const start = `${day.slice(0, 7)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${day.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

// Live "how much of this month's personal allowance is left, as of `day`"
// ledger. Mirrors useSafeToSpend's shape and useLiveQuery wrapper pattern.
export function useDailyLeftover(day: string): {
  result: DailyLeftoverResult | null
  isLoading: boolean
} {
  const data = useLiveQuery(async () => {
    const allowance = await db.allowance.get('local')
    if (!allowance) return null

    const { start, end } = monthBounds(day)
    const transactions = await db.transactions
      .where('date')
      .between(start, end, true, true)
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
