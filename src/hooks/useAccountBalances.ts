import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { deriveBalance, overdraftSince } from '@lib/balances'

// Live per-account balances + total across active accounts.
// Returns undefined while loading (useLiveQuery semantics).
//
// `balances` stays the true signed balance (FR-3.1) — the row shows what the
// ledger says. The overdraft split is a net-worth concern and lives in
// useNetWorth; here we only add the date each overdrawn account crossed zero so
// the row can state it. Null means overdrawn but undateable (see overdraftSince).
export function useAccountBalances() {
  return useLiveQuery(async () => {
    const [accounts, txns] = await Promise.all([
      db.accounts.filter((a) => a.is_active).toArray(),
      db.transactions.toArray(),
    ])
    const balances = new Map<string, number>()
    const overdrawnSince = new Map<string, string | null>()
    let total = 0
    for (const a of accounts) {
      const b = deriveBalance(a, txns)
      balances.set(a.id as string, b)
      if (b < 0) overdrawnSince.set(a.id as string, overdraftSince(a, txns))
      total += b
    }
    return { balances, overdrawnSince, total }
  })
}
