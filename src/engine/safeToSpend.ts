import type { Allowance, RecurringItem, Transaction } from '@db/types'
import { workdaysRemaining, weeksInMonth } from '@lib/dates'

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
    !t.recurring_item_id
  )
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
