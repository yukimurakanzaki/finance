// M1 Product Integrity Audit — FI Projection integration test.
// FI Projection Invariant:
//   FI Projection predicts future financial independence.
//   It consumes verified financial state.
//   It never mutates financial state.
//   Projection is deterministic for identical inputs.
//   Changing assumptions changes projections only.
//   Changing historical transactions changes the source data.
//   Projection never rewrites history.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { computeFIProjection } from '@engine/fiProjection'
import { REAL_RETURN_RATES } from '@engine/returnRates'
import { DEFAULT_ASSUMPTIONS } from '@db/repositories/assumptions.repo'
import type { Asset, Assumptions, AssetType, RecurringItem } from '@db/types'

const TUE = new Date(2026, 6, 7)

const BASE_ASM: Assumptions = {
  id: 'local',
  target_low: 1_000_000_000,
  target_high: 2_000_000_000,
  return_rdpu: 0.03,
  return_equity: 0.07,
  return_dplk: 0.04,
  return_gold: 0.01,
  inflation_rate: 0.03,
  equity_switch_month: 6,
  lifestyle_ceiling_monthly: null,
  updated_at: '',
}

const assets = (over: Partial<Record<AssetType, number>>): Record<AssetType, number> => ({
  investment_rdpu: 0, investment_equity: 0, gold: 0, dplk: 0,
  storyforge: 0, currency: 0, other: 0,
  ...over,
})

// Replicates useFIProjection query path without React.
async function computeFromDB() {
  const [assumptions, assetRows, recurringItems] = await Promise.all([
    db.assumptions.get('local'),
    db.assets.toArray(),
    db.recurringItems.filter((r) => r.is_active && r.kind === 'pay_yourself_first').toArray(),
  ])

  const asm = assumptions ?? { id: 'local' as const, ...DEFAULT_ASSUMPTIONS }
  const currentAssets: Record<AssetType, number> = assets({})
  for (const a of assetRows) {
    currentAssets[a.asset_type] = (currentAssets[a.asset_type] ?? 0) + a.value
  }
  const pipeMonthlyActive = recurringItems.reduce((s, r) => s + r.amount, 0)

  return computeFIProjection({
    assumptions: asm,
    currentAssets,
    pipeMonthlyActive,
    currentDate: TUE,
  })
}

beforeEach(async () => {
  await Promise.all([
    db.assumptions.clear(),
    db.assets.clear(),
    db.recurringItems.clear(),
  ])
  await db.assumptions.put(BASE_ASM)
})

describe('FI Projection: determinism and immutability', () => {
  it('same inputs produce identical output', () => {
    const r1 = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    const r2 = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    expect(r1).toEqual(r2)
  })

  it('does not mutate input assumptions', () => {
    const asmCopy = { ...BASE_ASM }
    computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    expect(BASE_ASM).toEqual(asmCopy)
  })

  it('does not mutate input assets', () => {
    const a = assets({ investment_rdpu: 100_000_000, investment_equity: 50_000_000 })
    const aCopy = { ...a }
    computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: a,
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    expect(a).toEqual(aCopy)
  })
})

describe('FI Projection: assumption sensitivity', () => {
  it('higher return_rdpu reaches FI sooner (Path B, long RDPU phase)', () => {
    const asmLongRdpu = { ...BASE_ASM, equity_switch_month: 120 }
    const base = computeFIProjection({
      assumptions: asmLongRdpu,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    const higher = computeFIProjection({
      assumptions: { ...asmLongRdpu, return_rdpu: 0.05 },
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    expect(higher.years_to_fi_path_b!).toBeLessThan(base.years_to_fi_path_b!)
  })

  it('higher return_equity reaches FI sooner (Path B after switch)', () => {
    const base = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    const higher = computeFIProjection({
      assumptions: { ...BASE_ASM, return_equity: 0.09 },
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    expect(higher.years_to_fi_path_b!).toBeLessThanOrEqual(base.years_to_fi_path_b!)
  })

  it('lower target reaches FI sooner', () => {
    const base = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    const lower = computeFIProjection({
      assumptions: { ...BASE_ASM, target_low: 500_000_000 },
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    expect(lower.years_to_fi_path_b!).toBeLessThan(base.years_to_fi_path_b!)
    expect(lower.gap_to_low).toBe(400_000_000)
  })

  it('more pipe reaches FI sooner', () => {
    const less = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 3_000_000,
      currentDate: TUE,
    })
    const more = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 10_000_000,
      currentDate: TUE,
    })
    expect(more.years_to_fi_path_b!).toBeLessThan(less.years_to_fi_path_b!)
  })
})

describe('FI Projection: boundary cases', () => {
  it('zero assets, zero pipe → null (never reachable)', () => {
    const r = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({}),
      pipeMonthlyActive: 0,
      currentDate: TUE,
    })
    expect(r.years_to_fi_path_b).toBeNull()
    expect(r.years_to_fi_path_a).toBeNull()
    expect(r.fi_date_path_b).toBeNull()
    expect(r.fi_date_path_a).toBeNull()
  })

  it('zero assets with pipe → reachable', () => {
    const r = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({}),
      pipeMonthlyActive: 10_000_000,
      currentDate: TUE,
    })
    expect(r.years_to_fi_path_b).not.toBeNull()
    expect(r.fi_date_path_b).not.toBeNull()
  })

  it('already at target → gap 0 for both low and high', () => {
    const r = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ investment_equity: 2_500_000_000 }),
      pipeMonthlyActive: 0,
      currentDate: TUE,
    })
    expect(r.gap_to_low).toBe(0)
    expect(r.gap_to_high).toBe(0)
  })

  it('speculative assets contribute to total but not to growth', () => {
    const r = computeFIProjection({
      assumptions: BASE_ASM,
      currentAssets: assets({ storyforge: 500_000_000 }),
      pipeMonthlyActive: 5_000_000,
      currentDate: TUE,
    })
    // Storyforge counted in total_current
    expect(r.total_current).toBe(500_000_000)
    // But 0% real return means it doesn't compound — gap still large
    expect(r.gap_to_low).toBe(500_000_000)
  })
})

describe('FI Projection: integration (DB → hook path)', () => {
  it('queries assumptions, assets, and pipe from DB', async () => {
    const asset: Asset = {
      name: 'RDPU BCA', lane: 'income_producing', asset_type: 'investment_rdpu',
      value: 100_000_000, quantity_grams: null, price_per_gram: null, auto_price: null,
      fx_code: null, fx_amount: null, last_valued_at: '', note: null, created_at: '',
    }
    await db.assets.put(asset)

    const pyf: RecurringItem = {
      name: 'Save monthly', amount: 5_000_000, cadence: 'monthly',
      kind: 'pay_yourself_first', lane: 'income_producing', is_protected: true,
      is_active: true, next_due: '2026-08-01', end_date: null, note: null, created_at: '',
    }
    await db.recurringItems.put(pyf)

    const r = await computeFromDB()

    expect(r.total_current).toBe(100_000_000)
    expect(r.gap_to_low).toBe(900_000_000)
    expect(r.years_to_fi_path_b).not.toBeNull()
  })

  it('default assumptions used when none saved', async () => {
    await db.assumptions.clear()
    const r = await computeFromDB()
    // DEFAULT_ASSUMPTIONS target_low = 4.5B
    expect(r.gap_to_low).toBe(DEFAULT_ASSUMPTIONS.target_low)
  })
})
