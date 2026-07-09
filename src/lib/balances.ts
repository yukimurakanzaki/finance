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
