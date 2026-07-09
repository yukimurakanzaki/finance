import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { deriveBalance } from '@lib/balances'

// Live per-account balances + total across active accounts.
// Returns undefined while loading (useLiveQuery semantics).
export function useAccountBalances() {
  return useLiveQuery(async () => {
    const [accounts, txns] = await Promise.all([
      db.accounts.filter((a) => a.is_active).toArray(),
      db.transactions.toArray(),
    ])
    const balances = new Map<string, number>()
    let total = 0
    for (const a of accounts) {
      const b = deriveBalance(a, txns)
      balances.set(a.id as string, b)
      total += b
    }
    return { balances, total }
  })
}
