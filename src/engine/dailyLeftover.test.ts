import type { Transaction } from '@db/types'
import { todayISO } from '@lib/dates'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDailyLeftover } from './dailyLeftover'

// The clock is pinned mid-month for the whole suite. `todayISO()` reads
// `new Date()`, so this fully determines what the engine considers "today".
//
// Mid-month specifically: the projection assertion below compares a future day
// against the last real day, and that invariant only holds *within* one
// calendar month — computeDailyLeftover scopes to the month of `asOfDate`, so
// crossing a month boundary legitimately resets the ledger to a fresh
// allowance. Running on the last day of a month used to push "tomorrow" into
// the next month and fail the suite for that one day.
const PINNED_TODAY = '2026-07-15'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00`))
})

afterEach(() => {
  vi.useRealTimers()
})

// Tomorrow relative to the pinned clock — genuinely in the future for
// isProjected, and guaranteed to stay in the same month as PINNED_TODAY.
function tomorrow(): string {
  const d = new Date(`${todayISO()}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

const txn = (overrides: Partial<Transaction>): Transaction => ({
  date: '2026-07-10',
  amount: 10_000,
  title: null,
  direction: 'out',
  account_id: 'acc1',
  category_id: null,
  lane: 'protected_living',
  source: 'manual',
  note: null,
  original_amount: null,
  overridden_amount: null,
  override_note: null,
  overridden_at: null,
  is_transfer: false,
  transfer_pair_id: null,
  recurring_item_id: null,
  created_at: '',
  ...overrides,
})

describe('computeDailyLeftover', () => {
  it('nets expense transactions through a mid-month day, excluding income (isWeekDraw is out-only)', () => {
    const r = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions: [
        txn({ date: '2026-07-03', direction: 'out', amount: 50_000 }),
        // Income never draws the pool — isWeekDraw requires direction 'out'
        // (mirrors the weekly safe-to-spend gauge's own semantics exactly).
        txn({ date: '2026-07-09', direction: 'in', amount: 20_000 }),
        txn({ date: '2026-07-15', direction: 'out', amount: 30_000 }), // after asOfDate, excluded
      ],
      asOfDate: '2026-07-10',
    })
    // 1,000,000 − 50,000 = 950,000 (income excluded; the 07-15 spend is outside the window)
    expect(r.leftover).toBe(950_000)
    expect(r.isProjected).toBe(false)
  })

  it('excludes a transaction tagged with recurring_item_id', () => {
    const r = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions: [
        txn({
          date: '2026-07-05',
          amount: 100_000,
          recurring_item_id: 'rec-1',
        }),
        txn({ date: '2026-07-06', amount: 40_000 }),
      ],
      asOfDate: '2026-07-10',
    })
    // Only the untagged 40,000 draws the pool.
    expect(r.leftover).toBe(960_000)
  })

  it('excludes a transfer', () => {
    const r = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions: [
        txn({ date: '2026-07-05', amount: 500_000, is_transfer: true }),
      ],
      asOfDate: '2026-07-10',
    })
    expect(r.leftover).toBe(1_000_000)
  })

  it('a future date returns isProjected: true, today returns false', () => {
    const transactions = [txn({ date: todayISO(), amount: 100_000 })]
    const opts = { monthlyAmount: 1_000_000, transactions }
    expect(
      computeDailyLeftover({ ...opts, asOfDate: todayISO() }).isProjected,
    ).toBe(false)
    expect(
      computeDailyLeftover({ ...opts, asOfDate: tomorrow() }).isProjected,
    ).toBe(true)
  })

  // Projecting forward inside a month just carries the running total — nothing
  // new is subtracted. Fixed dates, no system clock: the previous version of
  // this assertion compared today against tomorrow and so failed every time the
  // suite ran on the last day of a month, when "tomorrow" is a different month
  // with its own window (dailyLeftover.ts: no carry-over between months).
  it("a later day in the same month equals the last spending day's leftover", () => {
    const transactions = [txn({ date: '2026-03-10', amount: 100_000 })]
    const opts = { monthlyAmount: 1_000_000, transactions }
    const spendingDay = computeDailyLeftover({
      ...opts,
      asOfDate: '2026-03-10',
    })
    const later = computeDailyLeftover({ ...opts, asOfDate: '2026-03-25' })
    expect(spendingDay.leftover).toBe(900_000)
    expect(later.leftover).toBe(spendingDay.leftover)
  })

  it('a past date within the month returns isProjected: false', () => {
    const r = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions: [txn({ date: '2020-03-05', amount: 10_000 })],
      asOfDate: '2020-03-10',
    })
    expect(r.isProjected).toBe(false)
  })

  it('changing monthlyAmount between two calls with the same transactions changes the result', () => {
    const transactions = [txn({ date: '2026-07-05', amount: 40_000 })]
    const a = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions,
      asOfDate: '2026-07-10',
    })
    const b = computeDailyLeftover({
      monthlyAmount: 2_000_000,
      transactions,
      asOfDate: '2026-07-10',
    })
    expect(a.leftover).not.toBe(b.leftover)
    expect(b.leftover - a.leftover).toBe(1_000_000)
  })

  it('does not clamp a negative leftover to zero', () => {
    const r = computeDailyLeftover({
      monthlyAmount: 10_000,
      transactions: [txn({ date: '2026-07-05', amount: 50_000 })],
      asOfDate: '2026-07-10',
    })
    expect(r.leftover).toBe(-40_000)
  })
})
