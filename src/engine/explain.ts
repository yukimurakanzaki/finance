// Explain My Number (plan §5). Turns an engine result into the ordered rows that
// decompose it, so every info affordance in the app is generated from the same
// object the UI rendered its number from (FR-4.1) — never from a hand-authored
// per-screen formula string. One wrong decomposition here would otherwise be
// wrong on four screens, each with an info button attesting to it.
//
// Correction C-4 governs the shape of the safe-to-spend chain:
//   1. `allowance.monthly_amount` is ALREADY NET of every recurring item —
//      bills, subs, pay-yourself-first. Subtracting them here double-counts
//      (C-1). They appear only in the separate "already excluded" block.
//   2. Account balance is a STOCK, not a component of this FLOW. Adding it would
//      make safe-to-spend leap by the whole balance every payday.
import type { SafeToSpendResult } from './safeToSpend'

/**
 * `declared` — the user set this; it links to its edit screen and reads
 * "you set this". `derived` — the app calculated it (FR-4.4).
 */
export type ExplainRowKind = 'declared' | 'derived'

/** How this row combines with the one above it. */
export type ExplainOp = 'base' | 'minus' | 'divide' | 'equals'

export interface ExplainRow {
  /** Stable id; the UI maps it to an i18n label and, for declared rows, a target. */
  id: string
  kind: ExplainRowKind
  op: ExplainOp
  /** null renders as an em dash, never `Rp 0` (FR-4.6). */
  value: number | null
  /**
   * Set when the engine did something the arithmetic above does not show, so
   * the UI can footnote it rather than leaving the reader to spot a mismatch:
   * `floored` — integer division dropped a remainder;
   * `clamped` — a negative intermediate was held at zero.
   */
  note?: 'floored' | 'clamped'
}

export interface Explanation {
  rows: ExplainRow[]
  /**
   * Recurring totals, shown in their own "already excluded from your allowance"
   * block — never inside the subtraction chain (FR-4.3).
   */
  alreadyExcluded: { id: string; value: number }[]
  /**
   * FR-4.7: only ever true on real declared commitments. An unset allowance is
   * not a negative pool, it is an absent one.
   */
  showNegativePoolWarning: boolean
}

// A declared input of zero means "not configured", not "configured as nothing" —
// so it and everything derived below it render as em dashes (FR-4.6).
const isUnset = (n: number) => !Number.isFinite(n) || n <= 0

// Stands in for a null engine result so the row list is built once, not twice.
// Never read for values — `unset` forces every row to null before these are used.
const EMPTY_RESULT = {
  payYourselfFirstTotal: 0,
  householdBillTotal: 0,
  personalPool: 0,
  personalSubTotal: 0,
  weekendAllocation: 0,
  monthlyDiscretionary: 0,
  weeks: 0,
  weekPool: 0,
  spentThisWeek: 0,
  remainingPool: 0,
  remainingWorkdays: 0,
  todayCeiling: 0,
  isNullState: true,
  isNegativePool: false,
  isAmber: false,
} satisfies SafeToSpendResult

/**
 * Safe to spend today, decomposed per FR-4.2:
 *
 *   Monthly allowance (declared)
 *   − Weekend allocation (declared)
 *   = Discretionary
 *   ÷ weeks in month
 *   = This week's pool
 *   − Spent this week
 *   = Remaining
 *   ÷ remaining workdays
 *   = Safe to spend today
 *
 * Every value is read off `result`. Nothing here recomputes (NFR-4.1); the
 * `note` fields exist precisely because the engine floors and clamps, so the
 * displayed chain would otherwise appear not to add up.
 */
export function explainSafeToSpend(
  result: SafeToSpendResult | null,
): Explanation {
  // `computeSafeToSpend` returns null for an unconfigured allowance — that IS
  // the unset state, so it is handled here rather than at each call site. The
  // sheet still opens and still shows its structure; every row is an em dash
  // (FR-4.6), which tells the reader what the number is made of and that they
  // have not supplied it yet.
  const unset = result === null || isUnset(result.personalPool)
  const r: SafeToSpendResult = result ?? EMPTY_RESULT

  // Once the allowance is unset every row below it is meaningless, so they all
  // go to null together rather than showing a chain of confident zeroes.
  const v = (n: number): number | null => (unset ? null : n)

  const rows: ExplainRow[] = [
    { id: 'allowance', kind: 'declared', op: 'base', value: v(r.personalPool) },
    {
      id: 'weekendAllocation',
      kind: 'declared',
      op: 'minus',
      value: v(r.weekendAllocation),
    },
    {
      id: 'discretionary',
      kind: 'derived',
      op: 'equals',
      value: v(r.monthlyDiscretionary),
    },
    { id: 'weeks', kind: 'derived', op: 'divide', value: v(r.weeks) },
    {
      id: 'weekPool',
      kind: 'derived',
      op: 'equals',
      value: v(r.weekPool),
      // Math.floor on the division, and held at 0 when discretionary <= 0.
      note: r.isNegativePool ? 'clamped' : 'floored',
    },
    {
      id: 'spentThisWeek',
      kind: 'derived',
      op: 'minus',
      value: v(r.spentThisWeek),
    },
    {
      id: 'remainingPool',
      kind: 'derived',
      op: 'equals',
      value: v(r.remainingPool),
      // Math.max(0, ...): overspending the week shows 0 remaining, not a negative.
      ...(r.spentThisWeek > r.weekPool ? { note: 'clamped' as const } : {}),
    },
    {
      id: 'remainingWorkdays',
      kind: 'derived',
      op: 'divide',
      value: v(r.remainingWorkdays),
    },
    {
      id: 'todayCeiling',
      kind: 'derived',
      op: 'equals',
      value: v(r.todayCeiling),
      ...(r.remainingWorkdays > 0 ? { note: 'floored' as const } : {}),
    },
  ]

  return {
    rows,
    alreadyExcluded: unset
      ? []
      : [
          { id: 'payYourselfFirst', value: r.payYourselfFirstTotal },
          { id: 'householdBills', value: r.householdBillTotal },
          { id: 'personalSubs', value: r.personalSubTotal },
        ],
    showNegativePoolWarning: !unset && r.isNegativePool,
  }
}

/** The row carrying the number the screen displayed — the last `equals`. */
export function terminalRow(explanation: Explanation): ExplainRow {
  const equals = explanation.rows.filter((r) => r.op === 'equals')
  return equals[equals.length - 1] as ExplainRow
}
