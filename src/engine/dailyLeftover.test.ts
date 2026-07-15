import type { Transaction } from '@db/types'
import { describe, expect, it } from 'vitest'
import { computeDailyLeftover, monthStartOf } from './dailyLeftover'

// Reuses the txn() factory shape from useSafeToSpend.test.ts — `dailyLeftover`
// is a sibling engine piece, so the field list and the default-value choice
// for `recurring_item_id` are identical, and the helper is short enough to
// keep locally rather than introduce a shared test util for a one-line type.
const txn = (over: Partial<Transaction>): Transaction => ({
  id: 't1',
  date: '2000-07-15',
  amount: 50_000,
  direction: 'out',
  account_id: 'a1',
  category_id: null,
  lane: 'protected_living',
  source: 'manual',
  title: null,
  note: null,
  original_amount: null,
  overridden_amount: null,
  override_note: null,
  overridden_at: null,
  is_transfer: false,
  transfer_pair_id: null,
  recurring_item_id: null,
  created_at: '',
  ...over,
})

describe('monthStartOf', () => {
  it('returns YYYY-MM-01 for any date in the month', () => {
    expect(monthStartOf('2026-07-01')).toBe('2026-07-01')
    expect(monthStartOf('2000-07-15')).toBe('2000-07-01')
    expect(monthStartOf('2026-07-31')).toBe('2026-07-01')
    expect(monthStartOf('2026-12-31')).toBe('2026-12-01')
  })
})

describe('computeDailyLeftover', () => {
  it('mid-month day with mixed income/expense nets correctly', () => {
    // Use a date that's always in the past so isProjected is deterministic
    // regardless of when the test runs (otherwise the assertion is time-of-
    // day-clock-dependent and brittle). Year 2000 — clearly past.
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({ id: '1', date: '2000-07-03', amount: 50_000, direction: 'out' }),
        txn({ id: '2', date: '2000-07-10', amount: 200_000, direction: 'in' }),
        txn({ id: '3', date: '2000-07-15', amount: 75_000, direction: 'out' }),
      ],
      asOfDate: '2000-07-15',
    })
    // 2,000,000 - 50,000 + 200,000 - 75,000 = 2,075,000
    expect(result.leftover).toBe(2_075_000)
    expect(result.isProjected).toBe(false)
  })

  it('a transaction tagged with recurring_item_id does NOT affect leftover', () => {
    // Same setup as the above, but the mid-month expense is a committed
    // bill payment — it is excluded by the same isWeekDraw predicate the
    // weekly gauge uses (T2 DECISION 2026-07-12).
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({ id: '1', date: '2000-07-03', amount: 50_000, direction: 'out' }),
        txn({
          id: '2',
          date: '2000-07-15',
          amount: 500_000,
          direction: 'out',
          recurring_item_id: 'rec-bill-1',
        }),
      ],
      asOfDate: '2000-07-15',
    })
    // Only the 50,000 discretionary expense counts; the 500,000 bill doesn't.
    expect(result.leftover).toBe(1_950_000)
  })

  it('a transfer does NOT affect the leftover', () => {
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({
          id: '1',
          date: '2000-07-15',
          amount: 1_000_000,
          direction: 'out',
          is_transfer: true,
          transfer_pair_id: 'pair-1',
        }),
        txn({
          id: '2',
          date: '2000-07-15',
          amount: 1_000_000,
          direction: 'in',
          is_transfer: true,
          transfer_pair_id: 'pair-1',
        }),
      ],
      asOfDate: '2000-07-15',
    })
    expect(result.leftover).toBe(2_000_000)
  })

  it('a pass_through-lane transaction does NOT affect the leftover', () => {
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({
          id: '1',
          date: '2000-07-15',
          amount: 500_000,
          lane: 'pass_through',
        }),
      ],
      asOfDate: '2000-07-15',
    })
    expect(result.leftover).toBe(2_000_000)
  })

  it('transactions before the viewed month are excluded', () => {
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        // June (prior month) — must not bleed into July's view.
        txn({ id: '1', date: '2000-06-30', amount: 999_000, direction: 'out' }),
        txn({ id: '2', date: '2000-07-10', amount: 100_000, direction: 'out' }),
      ],
      asOfDate: '2000-07-15',
    })
    expect(result.leftover).toBe(1_900_000)
  })

  it('transactions after asOfDate within the month are excluded (asOfDate-inclusive end)', () => {
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({ id: '1', date: '2000-07-10', amount: 100_000, direction: 'out' }),
        // Day after asOfDate — must not count yet.
        txn({ id: '2', date: '2000-07-16', amount: 999_000, direction: 'out' }),
      ],
      asOfDate: '2000-07-15',
    })
    expect(result.leftover).toBe(1_900_000)
  })

  it("a future date returns isProjected: true and equals the last real day's leftover", () => {
    // asOfDate must be in the future relative to todayISO(). Use 2999 as a
    // guaranteed-future year, and put the transaction in the SAME month so
    // it actually counts toward the leftover.
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({ id: '1', date: '2999-12-10', amount: 100_000, direction: 'out' }),
      ],
      asOfDate: '2999-12-31',
    })
    expect(result.leftover).toBe(1_900_000)
    expect(result.isProjected).toBe(true)
  })

  it('a past date within the month returns isProjected: false', () => {
    // Transaction and asOfDate in the same past month.
    const result = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: [
        txn({ id: '1', date: '2020-01-05', amount: 100_000, direction: 'out' }),
      ],
      asOfDate: '2020-01-15',
    })
    expect(result.leftover).toBe(1_900_000)
    expect(result.isProjected).toBe(false)
  })

  it('changing monthlyAmount between two calls with the same transactions changes the result', () => {
    // No caching: the function is pure, but a regression that introduced a
    // memoization keyed on transactions alone would miss this. Caller-side
    // staleness test, basically.
    const txns = [
      txn({ id: '1', date: '2000-07-10', amount: 100_000, direction: 'out' }),
    ]
    const a = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions: txns,
      asOfDate: '2000-07-15',
    })
    const b = computeDailyLeftover({
      monthlyAmount: 3_000_000,
      transactions: txns,
      asOfDate: '2000-07-15',
    })
    expect(a.leftover).toBe(1_900_000)
    expect(b.leftover).toBe(2_900_000)
  })

  it('a negative leftover is returned as-is (overspent is a signal, not a clamp)', () => {
    const result = computeDailyLeftover({
      monthlyAmount: 500_000,
      transactions: [
        txn({
          id: '1',
          date: '2000-07-10',
          amount: 1_000_000,
          direction: 'out',
        }),
      ],
      asOfDate: '2000-07-15',
    })
    expect(result.leftover).toBe(-500_000)
  })
})
