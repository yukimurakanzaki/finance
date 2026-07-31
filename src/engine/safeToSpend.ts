import type { Allowance, RecurringItem, Transaction } from '@db/types'
import {
  isoWeekEnd,
  isoWeekStart,
  workdaysRemaining,
  weeksInMonth,
} from '@lib/dates'

// A transaction draws down the personal safe-to-spend pool only if it is a
// plain outgoing spend: not a transfer, not pass-through, and not tagged as a
// committed recurring payment (bills/subs live in the recurring bucket, which
// the allowance is already net of — see computeSafeToSpend). Shared by the
// UI hook and the AI context builder so both report the same gauge.
export function isWeekDraw(t: Transaction): boolean {
  return (
    t.direction === 'out' &&
    !t.is_transfer &&
    t.lane !== 'pass_through' &&
    // Falsy check, not === null: rows written before the field existed (cloud
    // pulls from another device, restored pre-field backups) carry undefined
    // and must still count as ordinary discretionary draws.
    !t.recurring_item_id &&
    // D1 — a balance correction states what the account really holds; it is
    // bookkeeping, not spending. Same falsy-check reasoning as above.
    !t.is_adjustment
  )
}

// A row representing real money entering or leaving the household this period:
// not an internal transfer between own accounts (T1), and not a balance
// correction (D1), which restates what an account holds without anyone having
// earned or spent anything. This is the "actuals" definition — Report totals,
// the by-category breakdown those totals reconcile against, and the AI's
// monthly summary all filter through it so a screen and a chat reply can never
// quote different numbers for the same month.
//
// Deliberately NOT the same question as isWeekDraw: this one keeps committed
// recurring payments and pass-through rows, which are real flows even though
// they don't draw the personal pool.
export function isActualFlow(t: Transaction): boolean {
  return !t.is_transfer && !t.is_adjustment
}

export interface SafeToSpendInput {
  allowance: Allowance
  activeRecurringItems: RecurringItem[]
  spendThisWeek: number
  today: Date
}

export interface SafeToSpendResult {
  payYourselfFirstTotal: number
  householdBillTotal: number
  personalPool: number
  personalSubTotal: number
  weekendAllocation: number
  weekPool: number
  spentThisWeek: number
  remainingPool: number
  remainingWorkdays: number
  todayCeiling: number
  isNullState: boolean
  isNegativePool: boolean
  isAmber: boolean
}

export function computeSafeToSpend(
  input: SafeToSpendInput,
): SafeToSpendResult | null {
  const { allowance, activeRecurringItems, spendThisWeek, today } = input

  if (allowance.monthly_amount === 0) return null

  const payYourselfFirstTotal = activeRecurringItems
    .filter((r) => r.kind === 'pay_yourself_first')
    .reduce((s, r) => s + r.amount, 0)

  const householdBillTotal = activeRecurringItems
    .filter((r) => r.kind === 'household_bill')
    .reduce((s, r) => s + r.amount, 0)

  const personalSubTotal = activeRecurringItems
    .filter((r) => r.kind === 'personal_sub')
    .reduce((s, r) => s + r.amount, 0)

  const personalPool = allowance.monthly_amount
  const weekendAllocation = allowance.weekend_allocation

  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const weeks = weeksInMonth(yearMonth)

  // personalPool (allowance.monthly_amount) is ALREADY net of every recurring
  // item — bills, subs, pay-yourself-first — so only the weekend carve-out comes
  // out here. Subtracting personalSubTotal again would double-count subs (they
  // are also excluded from the draw side via recurring_item_id). personalSubTotal
  // and householdBillTotal are still returned, for display only.
  const monthlyDiscretionary = personalPool - weekendAllocation
  const isNegativePool = monthlyDiscretionary <= 0
  const weekPool = isNegativePool ? 0 : Math.floor(monthlyDiscretionary / weeks)

  const remainingPool = Math.max(0, weekPool - spendThisWeek)
  const remainingWorkdays = workdaysRemaining(today)

  const todayCeiling =
    remainingWorkdays > 0 ? Math.floor(remainingPool / remainingWorkdays) : 0

  const isAmber = remainingPool < todayCeiling || isNegativePool

  return {
    payYourselfFirstTotal,
    householdBillTotal,
    personalPool,
    personalSubTotal,
    weekendAllocation,
    weekPool,
    spentThisWeek: spendThisWeek,
    remainingPool,
    remainingWorkdays,
    todayCeiling,
    isNullState: false,
    isNegativePool,
    isAmber,
  }
}

// The whole derivation from a raw ledger: filter this week's draws, total them,
// compute. Shared by the AI context block and the check_affordability tool so a
// verdict can never disagree with the numbers the same turn just quoted — a
// chat/app mismatch is the fastest way to lose earned trust.
export function safeToSpendFromLedger(
  allowance: Allowance | undefined,
  activeRecurringItems: RecurringItem[],
  allTxns: Transaction[],
  today: Date,
): SafeToSpendResult | null {
  if (!allowance || allowance.monthly_amount <= 0) return null

  const spendThisWeek = allTxns
    .filter(
      (t) =>
        isWeekDraw(t) &&
        t.date >= isoWeekStart(today) &&
        t.date <= isoWeekEnd(today),
    )
    .reduce((s, t) => s + t.amount, 0)

  return computeSafeToSpend({
    allowance,
    activeRecurringItems,
    spendThisWeek,
    today,
  })
}
