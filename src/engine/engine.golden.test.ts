// Phase A engine golden-case suite (PROPOSAL §1.8).
// These pin the financial math: any change to an engine that shifts a number
// must consciously update a golden here (and bump engine_version).
import { describe, it, expect } from 'vitest'
import { computeSafeToSpend } from './safeToSpend'
import { computeFIProjection } from './fiProjection'
import { computeSavingsRate } from './savingsRate'
import { REAL_RETURN_RATES } from './returnRates'
import { weeksInMonth, workdaysRemaining, advanceByOneMonth } from '@lib/dates'
import { validateRow } from '../import/validator'
import type { Allowance, Assumptions, AssetType, RecurringItem } from '@db/types'

const allowance = (monthly: number, weekend = 0): Allowance => ({
  id: 'local', monthly_amount: monthly, weekend_allocation: weekend, updated_at: '',
})

const recurring = (kind: RecurringItem['kind'], amount: number): RecurringItem => ({
  name: kind, amount, cadence: 'monthly', kind, lane: 'protected_living',
  is_protected: kind === 'pay_yourself_first', is_active: true,
  next_due: '2026-07-01', end_date: null, note: null, created_at: '',
})

const ASSUMPTIONS: Assumptions = {
  target_low: 1_000_000_000, target_high: 1_500_000_000,
  return_rdpu: 0.03, return_equity: 0.07, return_dplk: 0.04, return_gold: 0.01,
  inflation_rate: 0.03, equity_switch_month: 6, lifestyle_ceiling_monthly: null, updated_at: '',
}

const assets = (v: Partial<Record<AssetType, number>>): Record<AssetType, number> => ({
  investment_rdpu: 0, investment_equity: 0, gold: 0, dplk: 0, storyforge: 0, currency: 0, other: 0,
  ...v,
})

// Tue 2026-07-07: July 2026 has 23 workdays → 4 workweeks; Tue → 4 workdays left.
const TUE = new Date(2026, 6, 7)
const SAT = new Date(2026, 6, 11)

describe('safeToSpend', () => {
  it('returns null when no allowance is configured', () => {
    expect(computeSafeToSpend({ allowance: allowance(0), activeRecurringItems: [], spendThisWeek: 0, today: TUE })).toBeNull()
  })

  it('golden: mid-week workweek pool math (integer rupiah throughout)', () => {
    const r = computeSafeToSpend({
      allowance: allowance(3_000_000, 400_000),
      activeRecurringItems: [recurring('pay_yourself_first', 2_500_000), recurring('personal_sub', 150_000)],
      spendThisWeek: 200_000,
      today: TUE,
    })!
    // allowance is already net of subs, so only the weekend carve comes out here:
    // discretionary = 3,000,000 − 400,000 weekend = 2,600,000 over 4 weeks
    expect(r.weekPool).toBe(650_000)
    expect(r.remainingPool).toBe(450_000)
    expect(r.remainingWorkdays).toBe(4)
    expect(r.todayCeiling).toBe(112_500)
    expect(r.isNegativePool).toBe(false)
    // subs are still surfaced for display, just not subtracted from the pool
    expect(r.personalSubTotal).toBe(150_000)
    for (const v of [r.weekPool, r.remainingPool, r.todayCeiling]) expect(Number.isInteger(v)).toBe(true)
  })

  it('T2: personal subs no longer subtract from the pool (allowance is already net of them)', () => {
    const base = { allowance: allowance(3_000_000, 400_000), spendThisWeek: 0, today: TUE }
    const withoutSubs = computeSafeToSpend({ ...base, activeRecurringItems: [] })
    const withSubs = computeSafeToSpend({
      ...base,
      activeRecurringItems: [recurring('personal_sub', 500_000)],
    })
    expect(withSubs?.weekPool).toBe(withoutSubs?.weekPool)
    expect(withSubs?.remainingPool).toBe(withoutSubs?.remainingPool)
    expect(withSubs?.personalSubTotal).toBe(500_000)
  })

  it('savings-first waterfall: the pipe sits above the pool — growing it never shrinks safe-to-spend', () => {
    const base = { activeRecurringItems: [recurring('pay_yourself_first', 1_000_000)], spendThisWeek: 0, today: TUE }
    const small = computeSafeToSpend({ allowance: allowance(3_000_000), ...base })!
    const big = computeSafeToSpend({
      allowance: allowance(3_000_000),
      activeRecurringItems: [recurring('pay_yourself_first', 9_000_000)], spendThisWeek: 0, today: TUE,
    })!
    expect(big.weekPool).toBe(small.weekPool)
    expect(big.payYourselfFirstTotal).toBe(9_000_000)
  })

  it('negative pool clamps to zero and flags amber-inform', () => {
    // Pool goes negative when the weekend carve-out exceeds the allowance itself.
    const r = computeSafeToSpend({
      allowance: allowance(500_000, 800_000),
      activeRecurringItems: [],
      spendThisWeek: 0, today: TUE,
    })!
    expect(r.isNegativePool).toBe(true)
    expect(r.weekPool).toBe(0)
    expect(r.todayCeiling).toBe(0)
    expect(r.isAmber).toBe(true)
  })

  it('recurring items never tip the pool negative (T2 at the clamp boundary)', () => {
    // Allowance 500k, weekend 450k → thin 50k pool. Piling on huge subs/bills
    // must NOT flip isNegativePool — any regression back toward subtracting
    // recurring totals from the pool fails here.
    const r = computeSafeToSpend({
      allowance: allowance(500_000, 450_000),
      activeRecurringItems: [recurring('personal_sub', 9_000_000), recurring('household_bill', 5_000_000)],
      spendThisWeek: 0, today: TUE,
    })!
    expect(r.isNegativePool).toBe(false)
    expect(r.weekPool).toBeGreaterThan(0)
  })

  it('weekend: zero workdays left means zero ceiling, no division blow-up', () => {
    const r = computeSafeToSpend({ allowance: allowance(3_000_000), activeRecurringItems: [], spendThisWeek: 0, today: SAT })!
    expect(r.remainingWorkdays).toBe(0)
    expect(r.todayCeiling).toBe(0)
  })

  it('overspend past the weekly pool floors at zero (never negative)', () => {
    const r = computeSafeToSpend({ allowance: allowance(2_000_000), activeRecurringItems: [], spendThisWeek: 99_000_000, today: TUE })!
    expect(r.remainingPool).toBe(0)
    expect(r.todayCeiling).toBe(0)
  })
})

describe('fiProjection', () => {
  it('golden: 100M RDPU start, 10M/mo pipe, 1B target → Path B 70 months, Path A 80 months', () => {
    const r = computeFIProjection({
      assumptions: ASSUMPTIONS,
      currentAssets: assets({ investment_rdpu: 100_000_000 }),
      pipeMonthlyActive: 10_000_000,
      currentDate: TUE,
    })
    expect(r.years_to_fi_path_b).toBeCloseTo(70 / 12, 10)
    expect(r.years_to_fi_path_a).toBeCloseTo(80 / 12, 10)
    expect(r.path_b_vs_a_savings_years).toBe(0.8)
    expect(r.gap_to_low).toBe(900_000_000)
  })

  it('never reachable: zero pipe, zero assets → null, not crash', () => {
    const r = computeFIProjection({
      assumptions: ASSUMPTIONS, currentAssets: assets({}), pipeMonthlyActive: 0, currentDate: TUE,
    })
    expect(r.years_to_fi_path_b).toBeNull()
    expect(r.fi_date_path_b).toBeNull()
  })

  it('already at target: gap is 0 (known quirk: years reports 1/12, not 0)', () => {
    const r = computeFIProjection({
      assumptions: ASSUMPTIONS,
      currentAssets: assets({ investment_equity: 2_000_000_000 }),
      pipeMonthlyActive: 0, currentDate: TUE,
    })
    expect(r.gap_to_low).toBe(0)
    expect(r.gap_to_high).toBe(0)
    expect(r.years_to_fi_path_b).toBeCloseTo(1 / 12, 10)
  })

  it('monotonic: a bigger pipe never delays FI', () => {
    const at = (pipe: number) =>
      computeFIProjection({
        assumptions: ASSUMPTIONS, currentAssets: assets({ investment_rdpu: 50_000_000 }),
        pipeMonthlyActive: pipe, currentDate: TUE,
      }).years_to_fi_path_b!
    expect(at(20_000_000)).toBeLessThanOrEqual(at(10_000_000))
    expect(at(10_000_000)).toBeLessThanOrEqual(at(5_000_000))
  })

  it('speculative asset classes are excluded from growth (0% real return)', () => {
    expect(REAL_RETURN_RATES.storyforge).toBe(0)
    expect(REAL_RETURN_RATES.currency).toBe(0)
    expect(REAL_RETURN_RATES.other).toBe(0)
  })
})

describe('savingsRate', () => {
  it('null-state on zero income', () => {
    const r = computeSavingsRate({ takeHomeNet: 0, pipeMonthlyActive: 1_000_000 })
    expect(r.is_null).toBe(true)
    expect(r.rate).toBe(0)
  })
  it('golden: 2.5M pipe on 10M take-home = 25%', () => {
    expect(computeSavingsRate({ takeHomeNet: 10_000_000, pipeMonthlyActive: 2_500_000 }).rate).toBe(0.25)
  })
  it('clamps to [0, 1]', () => {
    expect(computeSavingsRate({ takeHomeNet: 10_000_000, pipeMonthlyActive: 15_000_000 }).rate).toBe(1)
    expect(computeSavingsRate({ takeHomeNet: 10_000_000, pipeMonthlyActive: -1 }).rate).toBe(0)
  })
})

describe('date boundaries', () => {
  it('workweeks per month', () => {
    expect(weeksInMonth('2026-07')).toBe(4) // 23 workdays
    expect(weeksInMonth('2026-02')).toBe(4) // Feb 2026: 20 workdays
    expect(weeksInMonth('2028-02')).toBe(4) // leap February
  })
  it('workdays remaining by weekday', () => {
    expect(workdaysRemaining(new Date(2026, 6, 6))).toBe(5)  // Mon
    expect(workdaysRemaining(new Date(2026, 6, 10))).toBe(1) // Fri
    expect(workdaysRemaining(new Date(2026, 6, 12))).toBe(0) // Sun
  })
  it('advanceByOneMonth: plain dates', () => {
    expect(advanceByOneMonth('2026-07-15')).toBe('2026-08-15')
    expect(advanceByOneMonth('2026-12-01')).toBe('2027-01-01')
  })
  it('advanceByOneMonth: month-end rolls over (KNOWN ISSUE — Jan 31 lands Mar 3, skipping February)', () => {
    // Documents current behavior. A recurring item due on the 31st silently skips
    // short months. Flagged for a deliberate fix (clamp-to-month-end) in Phase C.
    expect(advanceByOneMonth('2026-01-31')).toBe('2026-03-03')
  })
})

describe('import validator (contract)', () => {
  const valid = {
    date: '2026-07-01', amount: 150_000, direction: 'out', account_id: 'acc-1',
    category: 'Groceries', suggested_lane: 'protected_living', note: 'lunch',
  }
  it('accepts a valid row', () => {
    expect(validateRow(valid, 0).ok).toBe(true)
  })
  it('accepts pass_through lane', () => {
    expect(validateRow({ ...valid, suggested_lane: 'pass_through' }, 0).ok).toBe(true)
  })
  it('rejects unknown lanes', () => {
    expect(validateRow({ ...valid, suggested_lane: 'yolo' }, 0).ok).toBe(false)
  })
  it('rejects non-positive amounts', () => {
    expect(validateRow({ ...valid, amount: 0 }, 0).ok).toBe(false)
    expect(validateRow({ ...valid, amount: -5 }, 0).ok).toBe(false)
  })
  it('rejects malformed dates', () => {
    expect(validateRow({ ...valid, date: '07/01/2026' }, 0).ok).toBe(false)
  })
})
