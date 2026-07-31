import { describe, expect, it } from 'vitest'
import {
  TIGHT_THRESHOLD,
  computeAffordability,
} from './affordability'
import type { SafeToSpendResult } from './safeToSpend'

// Only remainingPool drives the verdict; the rest of the result object is
// filled with values that would be wrong to read, so a regression that starts
// consulting them shows up as a failure rather than a coincidence.
const sts = (remainingPool: number): SafeToSpendResult => ({
  payYourselfFirstTotal: 999_999,
  householdBillTotal: 999_999,
  personalPool: 999_999,
  personalSubTotal: 999_999,
  weekendAllocation: 999_999,
  monthlyDiscretionary: 999_999,
  weeks: 999_999,
  weekPool: 999_999,
  spentThisWeek: 999_999,
  remainingPool,
  remainingWorkdays: 3,
  todayCeiling: 999_999,
  isNullState: false,
  isNegativePool: false,
  isAmber: false,
})

describe('computeAffordability', () => {
  it('is comfortable well below the threshold', () => {
    const r = computeAffordability(100_000, sts(1_000_000))
    expect(r.verdict).toBe('comfortable')
    expect(r.driver).toBe(1_000_000)
    expect(r.margin).toBe(900_000)
  })

  it('is tight above the threshold but within the pool', () => {
    const r = computeAffordability(600_000, sts(1_000_000))
    expect(r.verdict).toBe('tight')
    expect(r.margin).toBe(400_000)
  })

  it('is over when the amount exceeds the pool', () => {
    const r = computeAffordability(1_200_000, sts(1_000_000))
    expect(r.verdict).toBe('over')
    expect(r.margin).toBe(-200_000)
  })

  // Boundary assertions — the plan requires each threshold edge pinned, because
  // an off-by-one here is a verdict that contradicts the arithmetic beside it.
  describe('threshold boundaries', () => {
    it('exactly at the tight threshold is still comfortable', () => {
      const amount = 1_000_000 * TIGHT_THRESHOLD
      expect(computeAffordability(amount, sts(1_000_000)).verdict).toBe(
        'comfortable',
      )
    })

    it('one rupiah past the tight threshold is tight', () => {
      const amount = 1_000_000 * TIGHT_THRESHOLD + 1
      expect(computeAffordability(amount, sts(1_000_000)).verdict).toBe('tight')
    })

    it('spending the pool exactly is tight, not over', () => {
      const r = computeAffordability(1_000_000, sts(1_000_000))
      expect(r.verdict).toBe('tight')
      expect(r.margin).toBe(0)
    })

    it('one rupiah past the pool is over', () => {
      const r = computeAffordability(1_000_001, sts(1_000_000))
      expect(r.verdict).toBe('over')
      expect(r.margin).toBe(-1)
    })
  })

  // The plan's required fixture: a committed payment must NOT flip the verdict
  // by being subtracted here. allowance.monthly_amount is already net of every
  // recurring item, so charging it again would be the C-1 double count. The
  // flip happens through remainingPool alone.
  describe('committed payments do not double-count', () => {
    it('flips comfortable to over only via remainingPool', () => {
      const amount = 400_000
      expect(computeAffordability(amount, sts(1_000_000)).verdict).toBe(
        'comfortable',
      )
      // Same purchase, after the pool itself has been drawn down.
      expect(computeAffordability(amount, sts(300_000)).verdict).toBe('over')
    })
  })

  describe('unknown states', () => {
    it('is unknown when safe-to-spend is not configured', () => {
      const r = computeAffordability(100_000, null)
      expect(r).toEqual({ verdict: 'unknown', driver: null, margin: null })
    })

    it.each([0, -1, 1.5, Number.NaN])(
      'is unknown for a non-integer or non-positive amount: %s',
      (amount) => {
        expect(computeAffordability(amount, sts(1_000_000)).verdict).toBe(
          'unknown',
        )
      },
    )
  })

  // FR-D1c.3 — a verdict is never renderable without its driver. Enforced at
  // the type level too (driver is null only when verdict is 'unknown'), but
  // asserted because the coupling is the whole point of the requirement.
  it('always returns a driver alongside a real verdict', () => {
    for (const amount of [1, 100_000, 500_000, 1_000_000, 5_000_000]) {
      const r = computeAffordability(amount, sts(1_000_000))
      expect(r.verdict).not.toBe('unknown')
      expect(r.driver).not.toBeNull()
      expect(r.margin).not.toBeNull()
    }
  })

  it('is a pure function of its inputs', () => {
    const input = sts(1_000_000)
    const a = computeAffordability(600_000, input)
    const b = computeAffordability(600_000, input)
    expect(a).toEqual(b)
    expect(input.remainingPool).toBe(1_000_000)
  })
})
