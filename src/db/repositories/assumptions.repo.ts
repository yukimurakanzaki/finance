import { db } from '../db'
import type { Assumptions } from '../types'

const now = () => new Date().toISOString()

export const DEFAULT_ASSUMPTIONS: Omit<Assumptions, 'id'> = {
  target_low: 4_500_000_000,
  target_high: 6_000_000_000,
  return_rdpu: 0.03,
  return_equity: 0.07,
  return_dplk: 0.04,
  return_gold: 0.01,
  inflation_rate: 0.03,
  equity_switch_month: 6,
  lifestyle_ceiling_monthly: null,
  updated_at: now(),
}

export const assumptionsRepo = {
  get: async (): Promise<Assumptions> => {
    const existing = await db.assumptions.get(1)
    if (existing) return existing
    const id = await db.assumptions.add({ id: 1, ...DEFAULT_ASSUMPTIONS })
    return { id, ...DEFAULT_ASSUMPTIONS }
  },

  update: (patch: Partial<Omit<Assumptions, 'id'>>) =>
    db.assumptions.update(1, { ...patch, updated_at: now() }),
}
