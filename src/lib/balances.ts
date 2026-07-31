import type { Account, Transaction } from '@db/types'

// Per-account balance: the manual override (when set) is the true balance as of
// last_balance_updated_at; only transactions dated strictly AFTER that day move it.
// Transfer legs count on both sides — that is the whole point of a transfer.
// ponytail: day-granularity anchor — same-day txns after a correction are absorbed
// by it; switch the anchor to created_at if that ever misleads.
export function deriveBalance(account: Account, txns: Transaction[]): number {
  const hasAnchor = account.manual_balance_override !== null
  const anchorDay =
    hasAnchor && account.last_balance_updated_at
      ? account.last_balance_updated_at.slice(0, 10)
      : ''
  let balance = hasAnchor ? (account.manual_balance_override as number) : 0
  for (const t of txns) {
    if (t.account_id !== account.id) continue
    if (t.date <= anchorDay) continue
    balance += t.direction === 'in' ? t.amount : -t.amount
  }
  return balance
}

export interface OverdraftSplit {
  /** The account's non-negative contribution to its own lane. */
  assetPortion: number
  /** How far below zero it sits, as a positive number, for `debt_liability`. */
  overdraftLiability: number
}

// An overdrawn account is not a negative asset — it is an asset worth zero plus
// a debt. Net worth already subtracts `debt_liability`, so routing the shortfall
// there produces the same total while keeping each lane honest about what it
// holds.
//
// This exists because `deriveBalance` feeds the Assets screen, the AI context,
// and net-worth math independently (plan §10 / FR-3.2). Clamping at each display
// site would be three chances to drift, so the split is modelled once here and
// every aggregator consumes it. `deriveBalance` itself keeps returning the true
// signed balance — it is ledger truth and must not lie (FR-3.1).
export function splitOverdraft(balance: number): OverdraftSplit {
  return {
    assetPortion: Math.max(0, balance),
    overdraftLiability: Math.max(0, -balance),
  }
}

// The date the account last crossed below zero and stayed there, or null when it
// is not currently overdrawn. Replays the same anchor + ledger rules
// `deriveBalance` uses, so the two can never disagree about whether a balance is
// negative.
//
// Returns null when the account is overdrawn but the crossing predates the
// ledger — an anchor that was already negative with no `last_balance_updated_at`
// to date it. Callers render the badge without a date rather than inventing one.
export function overdraftSince(
  account: Account,
  txns: Transaction[],
): string | null {
  const hasAnchor = account.manual_balance_override !== null
  const anchorDay =
    hasAnchor && account.last_balance_updated_at
      ? account.last_balance_updated_at.slice(0, 10)
      : ''
  let balance = hasAnchor ? (account.manual_balance_override as number) : 0
  let since: string | null = balance < 0 && anchorDay ? anchorDay : null

  const ledger = txns
    .filter((t) => t.account_id === account.id && t.date > anchorDay)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  for (const t of ledger) {
    const before = balance
    balance += t.direction === 'in' ? t.amount : -t.amount
    // Only the crossing matters: going further negative doesn't reset the date,
    // and recovering to zero or above clears it entirely.
    if (before >= 0 && balance < 0) since = t.date
    else if (balance >= 0) since = null
  }

  return balance < 0 ? since : null
}
