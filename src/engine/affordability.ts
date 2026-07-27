import type { SafeToSpendResult } from './safeToSpend'

// D-1 option (c): the affordability answer is a threshold over numbers the
// engine already produced, not a judgement the model forms. computeAffordability
// returns the verdict; the assistant phrases it and cites `driver`. Audit A1's
// safety property survives because nothing about the conclusion is left to the
// model (see docs/plans/2026-07-25-ai-manager-ux-requirements.md §4 D-1c).
//
// NOTE — deliberate omission. The plan's sketch listed `upcomingCommitments` as
// an input. It is not one, and including it would reintroduce the C-1 double
// count: `allowance.monthly_amount` is ALREADY net of every recurring item, and
// isWeekDraw() excludes recurring-tagged payments from the draw side. Committed
// bills therefore never touch `remainingPool`. Subtracting them here would
// charge the household twice for the same commitment.

export type Verdict = 'comfortable' | 'tight' | 'over' | 'unknown'

export interface AffordabilityResult {
  verdict: Verdict
  // The one number that drove the verdict — always shown alongside it
  // (FR-D1c.3). For 'unknown' there is no driver.
  driver: number | null
  // remainingPool − amount. Negative on 'over'. Null when unknown.
  margin: number | null
}

// A purchase that eats more than this share of what's left for the week is
// "tight" rather than "comfortable". Tune the number, not the mechanism
// (FR-D1c.5). Fraction rather than a rupiah floor: any absolute figure would be
// wrong across households with different pool sizes.
export const TIGHT_THRESHOLD = 0.5

export function computeAffordability(
  amount: number,
  sts: SafeToSpendResult | null,
): AffordabilityResult {
  // Unconfigured household (no allowance) or a nonsense amount: say so rather
  // than guessing. An empty-state household must never see "over" — that reads
  // as a judgement about money the app doesn't know about yet.
  if (sts === null || !Number.isInteger(amount) || amount <= 0) {
    return { verdict: 'unknown', driver: null, margin: null }
  }

  const remaining = sts.remainingPool
  const margin = remaining - amount

  if (margin < 0) return { verdict: 'over', driver: remaining, margin }
  if (amount > remaining * TIGHT_THRESHOLD) {
    return { verdict: 'tight', driver: remaining, margin }
  }
  return { verdict: 'comfortable', driver: remaining, margin }
}
