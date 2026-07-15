// M1 Product Integrity Audit — Daily Leftover integration test.
// Daily Leftover Invariant:
//   Daily Leftover represents the discretionary spending remaining for the
//   current day. It is derived from the verified Safe-to-Spend engine.
//   It must never recreate allowance, recurring, or transfer logic.
//   It consumes verified outputs (isWeekDraw, monthlyAmount).
//
// Integration test: DB → useDailyLeftover query path → computeDailyLeftover.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { computeDailyLeftover, monthStartOf } from '@engine/dailyLeftover'
import { isWeekDraw } from '@engine/safeToSpend'
import type { Allowance, Transaction } from '@db/types'

const allowance: Allowance = {
  id: 'local', monthly_amount: 3_000_000, weekend_allocation: 400_000, updated_at: '',
}

const txn = (over: Partial<Transaction>): Transaction => ({
  date: '2000-07-15',
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

// Replicates useDailyLeftover query path without React.
async function computeFromDB(day: string) {
  const a = await db.allowance.get('local')
  if (!a || a.monthly_amount === 0) return null

  const monthStart = monthStartOf(day)
  const [y, m] = monthStart.split('-').map(Number) as [number, number]
  const lastDay = new Date(y, m, 0).getDate()
  const monthEnd = `${monthStart.slice(0, 8)}${String(lastDay).padStart(2, '0')}`

  const transactions = await db.transactions
    .where('date')
    .between(monthStart, monthEnd, true, true)
    .toArray()

  return computeDailyLeftover({
    monthlyAmount: a.monthly_amount,
    transactions,
    asOfDate: day,
  })
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.allowance.clear(),
  ])
  await db.allowance.put(allowance)
})

describe('Daily Leftover: inherits Safe-to-Spend invariants', () => {
  it('discretionary spend reduces leftover', async () => {
    await db.transactions.put(txn({ id: 't-coffee', date: '2000-07-10', amount: 50_000 }))
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(2_950_000)
    expect(r!.isProjected).toBe(false)
  })

  it('transfer does not affect leftover (inherits transfer exclusion)', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-out', date: '2000-07-10', amount: 1_000_000, direction: 'out', is_transfer: true, transfer_pair_id: 'p1' }),
      txn({ id: 't-in', date: '2000-07-10', amount: 1_000_000, direction: 'in', is_transfer: true, transfer_pair_id: 'p1' }),
    ])
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(3_000_000)
  })

  it('recurring-linked transaction does not affect leftover (inherits recurring exclusion)', async () => {
    await db.transactions.put(txn({ id: 't-netflix', date: '2000-07-10', amount: 150_000, recurring_item_id: 'rec-1' }))
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(3_000_000)
  })

  it('pass_through lane does not affect leftover', async () => {
    await db.transactions.put(txn({ id: 't-pt', date: '2000-07-10', amount: 500_000, lane: 'pass_through' }))
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(3_000_000)
  })

  it('income adds back to leftover (allowance top-up)', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-out', date: '2000-07-10', amount: 100_000, direction: 'out' }),
      txn({ id: 't-in', date: '2000-07-12', amount: 200_000, direction: 'in' }),
    ])
    const r = await computeFromDB('2000-07-15')
    // 3,000,000 - 100,000 + 200,000 = 3,100,000
    expect(r!.leftover).toBe(3_100_000)
  })
})

describe('Daily Leftover: lifecycle and determinism', () => {
  it('deleted transaction restores leftover', async () => {
    await db.transactions.put(txn({ id: 't-coffee', date: '2000-07-10', amount: 50_000 }))
    const before = await computeFromDB('2000-07-15')
    expect(before!.leftover).toBe(2_950_000)

    await db.transactions.delete('t-coffee')
    const after = await computeFromDB('2000-07-15')
    expect(after!.leftover).toBe(3_000_000)
  })

  it('edited transaction amount adjusts leftover', async () => {
    await db.transactions.put(txn({ id: 't-lunch', date: '2000-07-10', amount: 50_000 }))
    const before = await computeFromDB('2000-07-15')
    expect(before!.leftover).toBe(2_950_000)

    await db.transactions.update('t-lunch', { amount: 75_000 })
    const after = await computeFromDB('2000-07-15')
    expect(after!.leftover).toBe(2_925_000)
  })

  it('same data produces same result (deterministic)', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-1', date: '2000-07-03', amount: 50_000, direction: 'out' }),
      txn({ id: 't-2', date: '2000-07-10', amount: 200_000, direction: 'in' }),
      txn({ id: 't-3', date: '2000-07-15', amount: 75_000, direction: 'out' }),
    ])
    const r1 = await computeFromDB('2000-07-15')
    const r2 = await computeFromDB('2000-07-15')
    expect(r1).toEqual(r2)
  })

  it('overspend produces negative leftover (signal, not clamp)', async () => {
    await db.transactions.put(txn({ id: 't-big', date: '2000-07-10', amount: 4_000_000 }))
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(-1_000_000)
  })

  it('zero allowance returns null state', async () => {
    await db.allowance.update('local', { monthly_amount: 0 })
    const r = await computeFromDB('2000-07-15')
    expect(r).toBeNull()
  })

  it('month boundary: prior month transactions excluded', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-june', date: '2000-06-30', amount: 999_000, direction: 'out' }),
      txn({ id: 't-july', date: '2000-07-10', amount: 100_000, direction: 'out' }),
    ])
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(2_900_000)
  })

  it('asOfDate boundary: future-dated transactions within month excluded', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-before', date: '2000-07-10', amount: 100_000, direction: 'out' }),
      txn({ id: 't-after', date: '2000-07-16', amount: 999_000, direction: 'out' }),
    ])
    const r = await computeFromDB('2000-07-15')
    expect(r!.leftover).toBe(2_900_000)
  })
})

describe('Daily Leftover: projection layer (does not re-implement)', () => {
  it('uses isWeekDraw from safeToSpend, not its own filter', () => {
    // The engine imports and calls isWeekDraw. This test documents the
    // architectural contract: Daily Leftover is a projection layer.
    const linked = txn({ recurring_item_id: 'rec-1' })
    const unlinked = txn({ recurring_item_id: null })
    expect(isWeekDraw(linked)).toBe(false)
    expect(isWeekDraw(unlinked)).toBe(true)
  })
})
