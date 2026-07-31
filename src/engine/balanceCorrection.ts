// D1 — deciding a balance correction (PAIN-POINTS elicitation 2026-07-31,
// docs/plans/2026-07-31-ledger-control-requirements.md §3 L1.1).
//
// The user tells us what an account really holds; we book the gap as a
// transaction flagged `is_adjustment` so the money stays traceable and can be
// categorised later, without it ever counting as spending. This module owns the
// decision only — whether a correction is legal and what it should look like.
// Writing it is the repository's job.

export interface CorrectionInput {
  /**
   * What the app derives for this account **as of `asOfDate`** — i.e.
   * deriveBalance over the transactions dated up to and including that day.
   * Not today's balance: the user is stating what the account held on that
   * date, so the gap has to be measured there or a backdated correction
   * double-counts everything logged since.
   */
  derivedBalance: number
  /** What the user says is actually there. */
  actualBalance: number
  /** YYYY-MM-DD the correction is true as of. */
  asOfDate: string
  /** YYYY-MM-DD, the caller's today. Passed in so this stays clock-free. */
  today: string
  /**
   * The account's `last_balance_updated_at`, when a `manual_balance_override`
   * is set (the onboarding opening balance). null when the account has none.
   */
  anchorDate: string | null
  /**
   * Net effect of the account's transactions dated strictly after `asOfDate`
   * (in minus out). Used to project where the balance actually lands, which is
   * not the entered figure whenever the correction is backdated.
   */
  laterFlow: number
}

export type CorrectionPlan =
  | {
      ok: true
      /** Signed gap: negative when the account holds less than we thought. */
      delta: number
      /** |delta| — what the transaction carries. */
      amount: number
      direction: 'in' | 'out'
      /** Where the balance ends up once later transactions replay on top. */
      resultingBalance: number
    }
  | { ok: false; reason: 'no_change' | 'future_date' }
  | { ok: false; reason: 'before_anchor'; anchorDate: string }

// Dates are YYYY-MM-DD and compare lexicographically — no Date arithmetic, no
// timezone to get wrong (the convention the whole engine already follows).
export function planCorrection(input: CorrectionInput): CorrectionPlan {
  const { derivedBalance, actualBalance, asOfDate, today, anchorDate, laterFlow } = input

  if (asOfDate > today) return { ok: false, reason: 'future_date' }

  // deriveBalance treats the override as the truth as of its day and replays
  // only transactions dated strictly after it (`t.date <= anchorDay` is
  // skipped). An adjustment inside that window would be dropped on the floor
  // with no error and no moved balance, so refuse it here where we can explain.
  if (anchorDate !== null && asOfDate <= anchorDate) {
    return { ok: false, reason: 'before_anchor', anchorDate }
  }

  const delta = actualBalance - derivedBalance
  if (delta === 0) return { ok: false, reason: 'no_change' }

  return {
    ok: true,
    delta,
    amount: Math.abs(delta),
    direction: delta < 0 ? 'out' : 'in',
    resultingBalance: actualBalance + laterFlow,
  }
}
