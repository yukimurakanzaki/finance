import type { Transaction } from '@db/types'
import { todayISO } from '@lib/dates'
import { describe, expect, it } from 'vitest'
import { computeDailyLeftover } from './dailyLeftover'

// Tomorrow, relative to the real system clock — always genuinely in the
// future, so the isProjected assertions below don't rely on a fixed date that
// eventually becomes "the past" as the repo ages. (Edge case: if the test
// happens to run on the last day of a month, "tomorrow" falls in the next
// month, and the transactions dated "today" fall outside that next month's
// window — an intentional, documented limitation of this quick helper.)
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

  it("a future date returns isProjected: true and equals the last real day's leftover", () => {
    const today = todayISO()
    const transactions = [txn({ date: today, amount: 100_000 })]
    const lastRealDay = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions,
      asOfDate: today,
    })
    const projected = computeDailyLeftover({
      monthlyAmount: 1_000_000,
      transactions,
      asOfDate: tomorrow(),
    })
    expect(projected.isProjected).toBe(true)
    expect(lastRealDay.isProjected).toBe(false)
    expect(projected.leftover).toBe(lastRealDay.leftover)
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
