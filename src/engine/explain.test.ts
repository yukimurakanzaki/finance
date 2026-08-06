import type { Allowance, RecurringItem } from '@db/types'
import { describe, expect, it } from 'vitest'
import { explainSafeToSpend, terminalRow } from './explain'
import { computeSafeToSpend } from './safeToSpend'

const allowance = (monthly: number, weekend: number): Allowance => ({
  id: 'local',
  monthly_amount: monthly,
  weekend_allocation: weekend,
  onboarding_snoozed_until: null,
  updated_at: '',
})

const recurring = (
  kind: RecurringItem['kind'],
  amount: number,
  i: number,
): RecurringItem => ({
  id: `r${i}`,
  name: `item ${i}`,
  amount,
  cadence: 'monthly',
  kind,
  lane: 'protected_living',
  is_protected: false,
  is_active: true,
  next_due: '2026-08-01',
  end_date: null,
  note: null,
  created_at: '',
  deleted_at: null,
})

const row = (e: ReturnType<typeof explainSafeToSpend>, id: string) =>
  e.rows.find((r) => r.id === id)

describe('explainSafeToSpend', () => {
  const MID_MONTH = new Date('2026-07-15T12:00:00')

  it('follows the FR-4.2 chain in order', () => {
    const r = computeSafeToSpend({
      allowance: allowance(4_000_000, 800_000),
      activeRecurringItems: [],
      spendThisWeek: 0,
      today: MID_MONTH,
    })
    const e = explainSafeToSpend(r)
    expect(e.rows.map((x) => x.id)).toEqual([
      'allowance',
      'weekendAllocation',
      'discretionary',
      'weeks',
      'weekPool',
      'spentThisWeek',
      'remainingPool',
      'remainingWorkdays',
      'todayCeiling',
    ])
  })

  it('marks declared inputs distinctly from derived ones (FR-4.4)', () => {
    const r = computeSafeToSpend({
      allowance: allowance(4_000_000, 800_000),
      activeRecurringItems: [],
      spendThisWeek: 0,
      today: MID_MONTH,
    })
    const e = explainSafeToSpend(r)
    expect(row(e, 'allowance')?.kind).toBe('declared')
    expect(row(e, 'weekendAllocation')?.kind).toBe('declared')
    expect(row(e, 'discretionary')?.kind).toBe('derived')
    expect(row(e, 'todayCeiling')?.kind).toBe('derived')
  })

  it('keeps recurring totals OUT of the chain (C-1 / FR-4.3)', () => {
    // The whole point of the correction: these are already netted into
    // monthly_amount. If they ever appear as chain rows, the app is
    // double-counting them on every screen with an info button.
    const items = [
      recurring('household_bill', 1_200_000, 1),
      recurring('personal_sub', 300_000, 2),
      recurring('pay_yourself_first', 2_000_000, 3),
    ]
    const r = computeSafeToSpend({
      allowance: allowance(4_000_000, 800_000),
      activeRecurringItems: items,
      spendThisWeek: 0,
      today: MID_MONTH,
    })
    const e = explainSafeToSpend(r)

    const chainIds = e.rows.map((x) => x.id)
    expect(chainIds).not.toContain('householdBills')
    expect(chainIds).not.toContain('personalSubs')
    expect(chainIds).not.toContain('payYourselfFirst')

    // …they live in the separate "already excluded" block instead.
    expect(e.alreadyExcluded.map((x) => x.id)).toEqual([
      'payYourselfFirst',
      'householdBills',
      'personalSubs',
    ])

    // And the chain's first step is untouched by them.
    expect(row(e, 'allowance')?.value).toBe(4_000_000)
    expect(row(e, 'discretionary')?.value).toBe(3_200_000)
  })

  it('never adds the account balance to the chain (C-4 defect 2)', () => {
    // A stock must not enter a flow. There is no row that could carry one.
    const r = computeSafeToSpend({
      allowance: allowance(4_000_000, 800_000),
      activeRecurringItems: [],
      spendThisWeek: 0,
      today: MID_MONTH,
    })
    const e = explainSafeToSpend(r)
    expect(e.rows.map((x) => x.id)).not.toContain('balance')
    expect(e.rows.every((x) => x.op !== 'base' || x.id === 'allowance')).toBe(true)
  })

  it('renders every row as null when the allowance is unset (FR-4.6)', () => {
    // computeSafeToSpend returns null for monthly_amount === 0 — that IS the
    // unset state, so the explanation must handle null rather than assume a
    // result exists.
    const r = computeSafeToSpend({
      allowance: allowance(0, 0),
      activeRecurringItems: [],
      spendThisWeek: 0,
      today: MID_MONTH,
    })
    expect(r).toBeNull()

    const e = explainSafeToSpend(r)
    // The sheet still has its full structure — the reader learns what the
    // number is made of, and that they haven't supplied it yet.
    expect(e.rows).toHaveLength(9)
    expect(e.rows.every((x) => x.value === null)).toBe(true)
    expect(e.alreadyExcluded).toEqual([])
  })

  it('suppresses the negative-pool warning while the allowance is unset (FR-4.7)', () => {
    expect(explainSafeToSpend(null).showNegativePoolWarning).toBe(false)

    // A real declared commitment that swallows the allowance DOES warn.
    const realResult = computeSafeToSpend({
      allowance: allowance(500_000, 900_000),
      activeRecurringItems: [],
      spendThisWeek: 0,
      today: MID_MONTH,
    })
    expect(explainSafeToSpend(realResult).showNegativePoolWarning).toBe(true)
  })
})

describe('explainSafeToSpend — decomposition property (NFR-4.2)', () => {
  // The required regression guard against C-4. Note what "sums to the displayed
  // number" can and cannot mean here: `weekPool` and `todayCeiling` are FLOORED
  // quotients and `remainingPool` is CLAMPED at zero, so a naive left-to-right
  // total does not reproduce the result and asserting one would be wrong. The
  // real invariant is that each step reproduces the engine's own value under the
  // documented flooring/clamping, and the chain's terminal row is exactly the
  // number the screen displays.
  const monthlies = [0, 1, 500_000, 3_000_000, 4_000_001, 12_345_678]
  const weekends = [0, 1, 250_000, 800_000, 5_000_000]
  const spends = [0, 1, 200_000, 1_000_000, 9_999_999]
  const dates = [
    new Date('2026-02-01T12:00:00'),
    new Date('2026-07-15T12:00:00'),
    new Date('2026-07-31T12:00:00'),
    new Date('2026-11-30T12:00:00'),
  ]

  it('every generated combination reproduces the engine, step for step', () => {
    let checked = 0
    for (const m of monthlies) {
      for (const w of weekends) {
        for (const s of spends) {
          for (const today of dates) {
            const r = computeSafeToSpend({
              allowance: allowance(m, w),
              activeRecurringItems: [
                recurring('household_bill', 900_000, 1),
                recurring('personal_sub', 120_000, 2),
              ],
              spendThisWeek: s,
              today,
            })
            if (!r) continue
            const e = explainSafeToSpend(r)
            checked++

            if (m <= 0) {
              expect(e.rows.every((x) => x.value === null)).toBe(true)
              continue
            }

            const val = (id: string) => row(e, id)?.value as number

            // Declared → discretionary is plain subtraction, no clamping.
            expect(val('allowance') - val('weekendAllocation')).toBe(
              val('discretionary'),
            )

            // Floored division, or held at zero when the pool is negative.
            expect(val('weekPool')).toBe(
              r.isNegativePool
                ? 0
                : Math.floor(val('discretionary') / val('weeks')),
            )

            // Clamped at zero — overspending never shows a negative remainder.
            expect(val('remainingPool')).toBe(
              Math.max(0, val('weekPool') - val('spentThisWeek')),
            )

            // Floored again, or zero when the week is over.
            expect(val('todayCeiling')).toBe(
              val('remainingWorkdays') > 0
                ? Math.floor(val('remainingPool') / val('remainingWorkdays'))
                : 0,
            )

            // The guard that matters: the last row IS the displayed number.
            expect(terminalRow(e).value).toBe(r.todayCeiling)

            // No recurring total ever leaks into the chain (C-1).
            for (const id of ['householdBills', 'personalSubs', 'payYourselfFirst']) {
              expect(e.rows.map((x) => x.id)).not.toContain(id)
            }
          }
        }
      }
    }
    // Guards against the loops silently generating nothing.
    expect(checked).toBeGreaterThan(400)
  })
})
