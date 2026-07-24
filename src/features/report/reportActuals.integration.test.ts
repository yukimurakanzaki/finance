// M1 Product Integrity Audit — Report actuals integration test.
// T1 regression: transfer-inflated Report actuals.
// Original defect (PAIN-POINTS.md T1): Report's monthly actuals counted transfers
// as income & expenses. Moving Rp 5jt between own accounts showed +5jt income,
// +5jt expense on the screen labeled "actuals".
// This test permanently pins the fix: transfers must never inflate actuals.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import type { Transaction } from '@db/types'

// Use a fixed month to avoid date-determinism issues.
const YM = '2026-07'

const txn = (over: Partial<Transaction>): Transaction => ({
  date: '2026-07-10',
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

// Replicates ReportScreen.tsx aggregation logic.
async function computeActuals(yearMonth: string) {
  const monthTxns = await transactionsRepo.getByMonth(yearMonth)
  const income = monthTxns
    .filter((t) => t.direction === 'in' && !t.is_transfer)
    .reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxns
    .filter((t) => t.direction === 'out' && !t.is_transfer)
    .reduce((s, t) => s + t.amount, 0)
  return { income, expenses, net: income - expenses, count: monthTxns.length }
}

beforeEach(async () => {
  await db.transactions.clear()
})

describe('Report actuals: T1 transfer-exclusion regression', () => {
  it('T1: transfers do NOT inflate income or expenses', async () => {
    // Salary: 15jt income
    await db.transactions.put(txn({
      id: 't-salary', date: '2026-07-01', amount: 15_000_000,
      direction: 'in', title: 'Gaji',
    }))
    // Groceries: 500k expense
    await db.transactions.put(txn({
      id: 't-groceries', date: '2026-07-05', amount: 500_000,
      direction: 'out', title: 'Belanja',
    }))
    // Transfer: 5jt from BCA to GoPay (two legs)
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 5_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: 'Transfer to GoPay',
    })

    const { income, expenses, net } = await computeActuals(YM)

    // Income must be 15jt (salary only), NOT 20jt (salary + transfer-in)
    expect(income).toBe(15_000_000)
    // Expenses must be 500k (groceries only), NOT 5.5jt (groceries + transfer-out)
    expect(expenses).toBe(500_000)
    // Net must be 14.5jt, NOT 14.5jt - 5jt + 5jt = 14.5jt (would be same, but
    // the point is transfers don't appear at all)
    expect(net).toBe(14_500_000)
  })

  it('T1: transfer-only month shows zero income and zero expenses', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 2_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const { income, expenses } = await computeActuals(YM)
    expect(income).toBe(0)
    expect(expenses).toBe(0)
  })

  it('deleting a transfer does not change actuals (was already excluded)', async () => {
    await db.transactions.put(txn({
      id: 't-coffee', date: '2026-07-07', amount: 50_000,
      direction: 'out', title: 'Kopi',
    }))
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 1_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const before = await computeActuals(YM)
    expect(before.expenses).toBe(50_000)

    // Delete the transfer (both legs)
    const transferLeg = await db.transactions
      .where('is_transfer').equals(1 as any)
      .first()
    // Dexie boolean index workaround — filter manually
    const allTxns = await db.transactions.toArray()
    const transferOut = allTxns.find((t) => t.is_transfer && t.direction === 'out')
    await transactionsRepo.deleteWithPair(transferOut!.id!)

    const after = await computeActuals(YM)
    expect(after.expenses).toBe(50_000) // unchanged
    expect(after.income).toBe(0) // unchanged
  })

  it('getByMonth default excludes transfers', async () => {
    await db.transactions.put(txn({
      id: 't-income', date: '2026-07-01', amount: 10_000_000,
      direction: 'in', title: 'Gaji',
    }))
    await transactionsRepo.addTransfer({
      date: '2026-07-05', amount: 3_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const rows = await transactionsRepo.getByMonth(YM)
    // Only the salary row — transfer legs excluded by default
    expect(rows).toHaveLength(1)
    expect(rows[0]!.direction).toBe('in')
    expect(rows[0]!.is_transfer).toBe(false)
  })

  it('getByMonth with excludeTransfers=false includes transfer legs', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-05', amount: 3_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const rows = await transactionsRepo.getByMonth(YM, false)
    expect(rows).toHaveLength(2) // both transfer legs
    expect(rows.every((r) => r.is_transfer)).toBe(true)
  })

  it('monthly totals reconcile with individual transaction sums', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-salary', date: '2026-07-01', amount: 12_000_000, direction: 'in', title: 'Gaji' }),
      txn({ id: 't-rent', date: '2026-07-02', amount: 3_000_000, direction: 'out', title: 'Sewa' }),
      txn({ id: 't-groceries', date: '2026-07-05', amount: 500_000, direction: 'out', title: 'Belanja' }),
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, direction: 'out', title: 'Kopi' }),
    ])

    const { income, expenses, net } = await computeActuals(YM)
    expect(income).toBe(12_000_000)
    expect(expenses).toBe(3_550_000)
    expect(net).toBe(8_450_000)

    // Cross-check: sum all non-transfer txns directly
    const all = await db.transactions.toArray()
    const directIncome = all.filter((t) => t.direction === 'in' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)
    const directExpenses = all.filter((t) => t.direction === 'out' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)
    expect(income).toBe(directIncome)
    expect(expenses).toBe(directExpenses)
  })

  it('out-of-month transactions do not appear in month actuals', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't-june', date: '2026-06-28', amount: 1_000_000, direction: 'out', title: 'June dinner' }),
      txn({ id: 't-july', date: '2026-07-05', amount: 200_000, direction: 'out', title: 'July lunch' }),
      txn({ id: 't-aug', date: '2026-08-03', amount: 300_000, direction: 'out', title: 'Aug coffee' }),
    ])

    const { expenses } = await computeActuals(YM)
    expect(expenses).toBe(200_000) // only July
  })

  it('pass-through transactions are included in actuals (they are real flows)', async () => {
    // Pass-through lane is excluded from net worth and safe-to-spend,
    // but for Report actuals, the filter is only is_transfer + direction.
    // This test documents current behavior: pass-through IS counted.
    await db.transactions.bulkPut([
      txn({ id: 't-pt-out', date: '2026-07-10', amount: 3_000_000, lane: 'pass_through', direction: 'out', title: 'Group collection out' }),
      txn({ id: 't-pt-in', date: '2026-07-10', amount: 3_000_000, lane: 'pass_through', direction: 'in', title: 'Group collection in' }),
      txn({ id: 't-coffee', date: '2026-07-07', amount: 50_000, direction: 'out', title: 'Kopi' }),
    ])

    const { income, expenses } = await computeActuals(YM)
    // pass-through counted in actuals (current behavior — documented)
    expect(income).toBe(3_000_000)
    expect(expenses).toBe(3_050_000)
  })
})
