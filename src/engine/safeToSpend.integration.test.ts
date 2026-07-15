// M1 Product Integrity Audit — Safe-to-Spend integration test.
// Verifies the full data path: DB → week query → isWeekDraw filter → sum → computeSafeToSpend.
// Uses the exact same logic as useSafeToSpend.ts, exercised against a populated DB.
// Deterministic: uses fixed date 2026-07-07 (Tuesday), July 2026 = 23 workdays = 4 weeks.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { computeSafeToSpend, isWeekDraw } from '@engine/safeToSpend'
import { isoWeekStart, isoWeekEnd } from '@lib/dates'
import type { Allowance, RecurringItem, Transaction } from '@db/types'

// Tuesday 2026-07-07: July 2026 has 23 workdays → 4 workweeks; Tue → 4 workdays left.
const TUE = new Date(2026, 6, 7)
const WEEK_START = isoWeekStart(TUE) // 2026-07-06 (Monday)
const WEEK_END = isoWeekEnd(TUE) // 2026-07-10 (Friday)

const allowance: Allowance = {
  id: 'local',
  monthly_amount: 8_000_000,
  weekend_allocation: 1_000_000,
  updated_at: '',
}

const recurringItems: RecurringItem[] = [
  { id: 'rec-bill', name: 'Listrik', amount: 500_000, cadence: 'monthly', kind: 'household_bill', lane: 'protected_living', is_protected: true, is_active: true, next_due: '2026-07-05', end_date: null, note: null, created_at: '' },
  { id: 'rec-netflix', name: 'Netflix', amount: 200_000, cadence: 'monthly', kind: 'personal_sub', lane: 'protected_living', is_protected: false, is_active: true, next_due: '2026-07-08', end_date: null, note: null, created_at: '' },
]

const txn = (over: Partial<Transaction>): Transaction => ({
  date: '2026-07-07',
  amount: 50_000,
  title: null,
  direction: 'out',
  account_id: 'acc-bca',
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
  ...over,
})

// Replicates useSafeToSpend's query + compute path without React/dexie-react-hooks.
async function computeFromDB(today: Date): Promise<ReturnType<typeof computeSafeToSpend>> {
  const a = await db.allowance.get('local')
  if (!a || a.monthly_amount === 0) return null
  const weekStart = isoWeekStart(today)
  const weekEnd = isoWeekEnd(today)
  const [activeRecurring, weekTxns] = await Promise.all([
    db.recurringItems.filter((r) => r.is_active).toArray(),
    db.transactions
      .where('date')
      .between(weekStart, weekEnd, true, true)
      .filter(isWeekDraw)
      .toArray(),
  ])
  const spendThisWeek = weekTxns.reduce((s, t) => s + t.amount, 0)
  return computeSafeToSpend({ allowance: a, activeRecurringItems: activeRecurring, spendThisWeek, today })
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.recurringItems.clear(),
    db.allowance.clear(),
  ])
  await db.allowance.put(allowance)
  await db.recurringItems.bulkPut(recurringItems)
})

describe('Safe-to-Spend integration: full DB→engine path', () => {
  it('discretionary spend draws the pool, transfers and recurring do not', async () => {
    // Week: Mon 2026-07-06 … Fri 2026-07-10
    await db.transactions.bulkPut([
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, title: 'Kopi' }),
      txn({ id: 't-lunch', date: '2026-07-07', amount: 70_000, title: 'Lunch' }),
      txn({ id: 't-transfer', date: '2026-07-08', amount: 2_000_000, is_transfer: true, transfer_pair_id: 'pair-1', direction: 'out' }),
      txn({ id: 't-transfer-in', date: '2026-07-08', amount: 2_000_000, is_transfer: true, transfer_pair_id: 'pair-1', direction: 'in', account_id: 'acc-gopay' }),
      txn({ id: 't-netflix', date: '2026-07-08', amount: 200_000, recurring_item_id: 'rec-netflix', title: 'Netflix' }),
      txn({ id: 't-listrik', date: '2026-07-05', amount: 500_000, recurring_item_id: 'rec-bill', title: 'Listrik' }),
    ])

    const r = await computeFromDB(TUE)
    expect(r).not.toBeNull()

    // July 2026: 23 workdays → 4 weeks
    // discretionary = 8,000,000 − 1,000,000 weekend = 7,000,000
    // weekPool = floor(7,000,000 / 4) = 1,750,000
    expect(r!.weekPool).toBe(1_750_000)

    // Only coffee + lunch draw: 50,000 + 70,000 = 120,000
    expect(r!.spentThisWeek).toBe(120_000)
    expect(r!.remainingPool).toBe(1_630_000)

    // Tuesday → 4 workdays remaining
    expect(r!.remainingWorkdays).toBe(4)
    expect(r!.todayCeiling).toBe(Math.floor(1_630_000 / 4)) // 407,500
  })

  it('transaction outside the current week does not affect spend', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-lastweek', date: '2026-06-29', amount: 500_000, title: 'Last week dinner' }),
      txn({ id: 't-thisweek', date: '2026-07-07', amount: 100_000, title: 'Today coffee' }),
    ])

    const r = await computeFromDB(TUE)
    expect(r!.spentThisWeek).toBe(100_000)
    expect(r!.remainingPool).toBe(1_750_000 - 100_000)
  })

  it('income transaction does not draw the pool', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-salary', date: '2026-07-07', amount: 15_000_000, direction: 'in', title: 'Gaji' }),
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, title: 'Kopi' }),
    ])

    const r = await computeFromDB(TUE)
    expect(r!.spentThisWeek).toBe(50_000) // salary excluded by direction='out' filter
  })

  it('pass-through lane does not draw the pool', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-pt', date: '2026-07-07', amount: 3_000_000, lane: 'pass_through', title: 'Group collection' }),
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, title: 'Kopi' }),
    ])

    const r = await computeFromDB(TUE)
    expect(r!.spentThisWeek).toBe(50_000)
  })

  it('deleted transaction restores pool', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, title: 'Kopi' }),
      txn({ id: 't-lunch', date: '2026-07-07', amount: 70_000, title: 'Lunch' }),
    ])
    const before = await computeFromDB(TUE)
    expect(before!.spentThisWeek).toBe(120_000)

    await db.transactions.delete('t-lunch')
    const after = await computeFromDB(TUE)
    expect(after!.spentThisWeek).toBe(50_000)
    expect(after!.remainingPool).toBe(1_700_000)
  })

  it('edited transaction amount adjusts pool', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-lunch', date: '2026-07-07', amount: 70_000, title: 'Lunch' }),
    ])
    const before = await computeFromDB(TUE)
    expect(before!.spentThisWeek).toBe(70_000)

    await db.transactions.update('t-lunch', { amount: 100_000 })
    const after = await computeFromDB(TUE)
    expect(after!.spentThisWeek).toBe(100_000)
    expect(after!.remainingPool).toBe(1_650_000)
  })

  it('overspend floors remaining at zero, never negative', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-big', date: '2026-07-07', amount: 99_000_000, title: 'Shopping spree' }),
    ])
    const r = await computeFromDB(TUE)
    expect(r!.spentThisWeek).toBe(99_000_000)
    expect(r!.remainingPool).toBe(0)
    expect(r!.todayCeiling).toBe(0)
  })

  it('zero allowance returns null (null state)', async () => {
    await db.allowance.put({ id: 'local', monthly_amount: 0, weekend_allocation: 0, updated_at: '' })
    await db.transactions.bulkPut([
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, title: 'Kopi' }),
    ])
    const r = await computeFromDB(TUE)
    expect(r).toBeNull()
  })

  it('deterministic: same data + same date produces identical result', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, title: 'Kopi' }),
      txn({ id: 't-lunch', date: '2026-07-07', amount: 70_000, title: 'Lunch' }),
      txn({ id: 't-transfer', date: '2026-07-08', amount: 2_000_000, is_transfer: true, transfer_pair_id: 'p1', direction: 'out' }),
      txn({ id: 't-transfer-in', date: '2026-07-08', amount: 2_000_000, is_transfer: true, transfer_pair_id: 'p1', direction: 'in', account_id: 'acc-gopay' }),
      txn({ id: 't-netflix', date: '2026-07-08', amount: 200_000, recurring_item_id: 'rec-netflix', title: 'Netflix' }),
    ])

    const r1 = await computeFromDB(TUE)
    const r2 = await computeFromDB(TUE)
    expect(r1).toEqual(r2)
  })
})
