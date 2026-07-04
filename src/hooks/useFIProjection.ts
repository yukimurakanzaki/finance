import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { computeFIProjection, type FIProjectionResult } from '@engine/fiProjection'
import { computeSavingsRate, type SavingsRateResult } from '@engine/savingsRate'
import type { AssetType } from '@db/types'
import { DEFAULT_ASSUMPTIONS } from '@db/repositories/assumptions.repo'

export function useFIProjection(): {
  result: FIProjectionResult | null
  savingsRate: SavingsRateResult | null
  isLoading: boolean
} {
  const data = useLiveQuery(async () => {
    const [assumptions, assets, recurringItems, latestIncome] = await Promise.all([
      db.assumptions.get('local'),
      db.assets.toArray(),
      db.recurringItems.filter((r) => r.is_active && r.kind === 'pay_yourself_first').toArray(),
      db.incomeEvents.orderBy('date').last(),
    ])

    const asm = assumptions ?? { id: 'local', ...DEFAULT_ASSUMPTIONS }

    const currentAssets: Record<AssetType, number> = {
      investment_rdpu: 0,
      investment_equity: 0,
      gold: 0,
      dplk: 0,
      storyforge: 0,
      currency: 0,
      other: 0,
    }
    for (const a of assets) {
      currentAssets[a.asset_type] = (currentAssets[a.asset_type] ?? 0) + a.value
    }

    const pipeMonthlyActive = recurringItems.reduce((s, r) => s + r.amount, 0)

    const projResult = computeFIProjection({
      assumptions: asm,
      currentAssets,
      pipeMonthlyActive,
      currentDate: new Date(),
    })

    const srResult = latestIncome
      ? computeSavingsRate({ takeHomeNet: latestIncome.take_home_net, pipeMonthlyActive })
      : null

    return { projResult, srResult }
  })

  return {
    result: data?.projResult ?? null,
    savingsRate: data?.srResult ?? null,
    isLoading: data === undefined,
  }
}
