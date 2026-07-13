import { isWeekDraw } from './safeToSpend'
import type { Transaction } from '@db/types'
import { todayISO } from '@lib/dates'

// Running personal-allowance leftover for the month containing `asOfDate`.
//
// Why a separate engine piece, and not just another read of the weekly gauge:
// the weekly safe-to-spend number resets every Monday and answers "what's left
// for this week". This ledger answers the different question "how much of this
// MONTH's personal allowance do I have left, running total, as of the day I'm
// looking at — and what would it project to if I stopped spending?". Same
// funding-scope decision as the weekly gauge (T2 DECISION 2026-07-12):
// `allowance.monthly_amount` is already net of every committed recurring item,
// so we apply draws via the shared `isWeekDraw` predicate (which excludes
// transfers, pass_through lane, and any transaction tagged with a
// recurring_item_id). Recomputes fresh from `transactions` + the live
// `allowance` row — no stored historical ledger, identical pattern to
// `computeSafeToSpend`.
//
// Deliberately simple: no proration, no inter-month carry-over, no retroactive
// rewrite when the allowance changes. The spec in PHASE-3-HANDOFF §2.2 is
// the contract — this file implements it.

export interface DailyLeftoverInput {
  /** `allowance.monthly_amount`, current value. */
  monthlyAmount: number
  /** All transactions in the relevant month (callers should bound by month). */
  transactions: Transaction[]
  /** YYYY-MM-DD — the day being viewed. */
  asOfDate: string
}

export interface DailyLeftoverResult {
  /** Running leftover as of `asOfDate`. May be negative (overspent). */
  leftover: number
  /**
   * True when `asOfDate` is strictly after today. The leftover is then the
   * "what you'd have left if you stop spending" projection — we do not
   * attempt to subtract future-dated recurring items or otherwise predict
   * spending, per the spec.
   */
  isProjected: boolean
}

/**
 * Returns the first day of the calendar month containing `iso` (YYYY-MM-01).
 * No timezone juggling needed — date strings compare lexicographically.
 */
export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function computeDailyLeftover(
  input: DailyLeftoverInput,
): DailyLeftoverResult {
  const { monthlyAmount, transactions, asOfDate } = input

  // Step 2: start with the current allowance value. If the user changes it
  // mid-month, every day in the month recomputes against the new value —
  // this is a derived view, not a stored ledger.
  let leftover = monthlyAmount

  // Step 3: apply every week-drawing transaction from month-start through
  // asOfDate (inclusive of both ends — the viewed day's own transactions
  // count). `isWeekDraw` already does the "personal, non-committed" filter
  // the spec requires: not a transfer, not pass_through, not tagged with a
  // recurring_item_id, direction === 'out'. Income is added back so the
  // running total reflects any "allowance top-up" income logged against
  // personal funds.
  const monthStart = monthStartOf(asOfDate)
  for (const t of transactions) {
    if (t.date < monthStart || t.date > asOfDate) continue
    // Skip transfers and pass-through entirely — isWeekDraw returns false
    // for these, and an isWeekDraw filter would also drop 'in' rows. We
    // want the same filter semantics, then handle direction below.
    if (t.is_transfer || t.lane === 'pass_through') continue
    if (t.recurring_item_id) continue
    if (t.direction === 'in') {
      leftover += t.amount
    } else if (t.direction === 'out') {
      // Use the same predicate the weekly gauge uses for symmetry: the
      // spec says "where isWeekDraw(t) is true" — direction is already
      // 'out' there, so this branch is the safe-form re-check.
      if (isWeekDraw(t)) leftover -= t.amount
    }
  }

  // Step 4: a future date carries no transactions past today (the table is
  // bounded by callers to the current month and live data has nothing
  // future-dated), so leftover above is the "stop spending" projection.
  const isProjected = asOfDate > todayISO()

  return { leftover, isProjected }
}
