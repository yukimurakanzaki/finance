// Daily Leftover Ledger (PAIN-POINTS.md T2 DECISION + PHASE-3-HANDOFF.md §2.2).
// Answers a different question than the weekly safe-to-spend gauge (which resets
// every week): "how much of this month's personal allowance is left, running
// total, as of the day I'm looking at — and what would it project to if I
// stopped spending?" Additive and parallel to safeToSpend.ts — does not modify
// or replace it.
import type { Transaction } from '@db/types'
import { todayISO } from '@lib/dates'
import { isWeekDraw } from './safeToSpend'

export interface DailyLeftoverInput {
  /** allowance.monthly_amount, current value — no stored historical ledger. */
  monthlyAmount: number
  /** All transactions in the relevant calendar month (any date in the month is fine). */
  transactions: Transaction[]
  /** YYYY-MM-DD, the day being viewed. */
  asOfDate: string
}

export interface DailyLeftoverResult {
  /** Running total as of asOfDate. Not clamped to zero — negative is a legitimate signal. */
  leftover: number
  /** true when asOfDate is after today (no transactions exist yet there). */
  isProjected: boolean
}

// First day (YYYY-MM-01) of the calendar month containing `iso`. Date strings
// compare lexicographically, so no timezone juggling is needed.
export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

// Deliberately simple: no proration, no carry-over between months, no
// retroactive rewrites when the allowance changes — everything is derived
// fresh from `transactions` + the live `allowance` row, same pattern as
// computeSafeToSpend already uses.
export function computeDailyLeftover(
  input: DailyLeftoverInput,
): DailyLeftoverResult {
  const { monthlyAmount, transactions, asOfDate } = input
  const monthStart = monthStartOf(asOfDate)

  let leftover = monthlyAmount
  for (const t of transactions) {
    // isWeekDraw already excludes transfers, pass_through, and
    // recurring_item_id-tagged rows — precisely "personal, non-committed"
    // spend, which is what this ledger also tracks.
    if (!isWeekDraw(t)) continue
    if (t.date < monthStart || t.date > asOfDate) continue
    // isWeekDraw guarantees direction === 'out', so every matching row is a
    // draw — income never reaches here (see the out-only test in
    // dailyLeftover.test.ts). Subtract unconditionally rather than branching on
    // a direction that can't occur.
    leftover -= t.amount
  }

  return {
    leftover,
    isProjected: asOfDate > todayISO(),
  }
}
