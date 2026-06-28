import type { AssetType } from '@db/types'

// Real return rates (net of 3% inflation)
export const REAL_RETURN_RATES: Record<AssetType, number> = {
  investment_rdpu: 0.03,
  investment_equity: 0.07,
  gold: 0.01,
  dplk: 0.04, // 7% nominal − 3% inflation
  storyforge: 0.0, // speculative; excluded from FI projection
  other: 0.0,
}
