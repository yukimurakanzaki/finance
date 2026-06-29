import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import type { Lane, NetWorthSnapshot } from '@db/types'
import { todayISO } from '@lib/dates'

const STALE_DAYS = 35
const GOLD_STALE_DAYS = 30

export function useNetWorth() {
  const data = useLiveQuery(async () => {
    const [accounts, assets, snapshots] = await Promise.all([
      db.accounts.filter((a) => a.is_active).toArray(),
      db.assets.toArray(),
      db.netWorthSnapshots.orderBy('year_month').last(),
    ])

    const today = todayISO()

    // Derive account balances from transactions for bank accounts
    const txnSums: Record<number, number> = {}
    const allTxns = await db.transactions.filter((t) => !t.is_transfer).toArray()
    for (const t of allTxns) {
      txnSums[t.account_id] = (txnSums[t.account_id] ?? 0) + (t.direction === 'in' ? t.amount : -t.amount)
    }

    const byLane: Record<Lane, number> = {
      income_producing: 0,
      store_of_value: 0,
      debt_liability: 0,
      protected_living: 0,
    }

    for (const acc of accounts) {
      const balance =
        acc.account_type === 'bank'
          ? (txnSums[acc.id!] ?? 0)
          : (acc.manual_balance_override ?? 0)
      byLane[acc.lane] += balance
    }

    for (const asset of assets) {
      byLane[asset.lane] += asset.value
    }

    const total =
      byLane.income_producing +
      byLane.store_of_value -
      byLane.debt_liability +
      byLane.protected_living

    const goldAssets = assets.filter((a) => a.asset_type === 'gold')
    const isGoldStale = goldAssets.some((g) => {
      const days = (new Date(today).getTime() - new Date(g.last_valued_at).getTime()) / 86_400_000
      return days > GOLD_STALE_DAYS
    })

    const isStale = assets.some((a) => {
      const days = (new Date(today).getTime() - new Date(a.last_valued_at).getTime()) / 86_400_000
      return days > STALE_DAYS
    })

    return { total, byLane, latestSnapshot: snapshots ?? null, isStale, isGoldStale }
  })

  return {
    total: data?.total ?? null,
    byLane: data?.byLane ?? null,
    latestSnapshot: data?.latestSnapshot ?? null,
    isStale: data?.isStale ?? false,
    isGoldStale: data?.isGoldStale ?? false,
    isLoading: data === undefined,
  }
}
