// M1 Product Integrity Audit — Balances integration test.
// Balance Invariant:
//   Account balance = money currently held in that account.
//
//   Affected by:
//     ✓ income
//     ✓ expense
//     ✓ transfer in
//     ✓ transfer out
//     ✓ manual override (anchor: only txns AFTER anchor day count)
//
//   NOT affected by:
//     ✗ deleted transactions
//     ✗ transactions on other accounts
//     ✗ transactions on or before anchor day
//
// Integration test: DB → useAccountBalances query path → deriveBalance.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { deriveBalance } from '@lib/balances'
import type { Account, Transaction } from '@db/types'

const acc = (over: Partial<Account>): Account => ({
  id: 'acc-bca', name: 'BCA', institution: 'BCA', account_type: 'bank',
  lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '',
  ...over,
})

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

// Replicates useAccountBalances query path without React.
async function computeBalances() {
  const [accounts, txns] = await Promise.all([
    db.accounts.filter((a) => a.is_active).toArray(),
    db.transactions.toArray(),
  ])
  const balances = new Map<string, number>()
  let total = 0
  for (const a of accounts) {
    const b = deriveBalance(a, txns)
    balances.set(a.id as string, b)
    total += b
  }
  return { balances, total }
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.accounts.clear(),
  ])
})

describe('Balances: basic arithmetic', () => {
  it('income increases balance, expense decreases', async () => {
    await db.accounts.put(acc({ id: 'acc-bca' }))
    await db.transactions.bulkPut([
      txn({ id: 't-salary', date: '2026-07-01', amount: 10_000_000, direction: 'in', title: 'Gaji' }),
      txn({ id: 't-coffee', date: '2026-07-05', amount: 50_000, direction: 'out', title: 'Kopi' }),
    ])

    const { balances, total } = await computeBalances()
    expect(balances.get('acc-bca')).toBe(9_950_000)
    expect(total).toBe(9_950_000)
  })

  it('zero transactions = zero balance (no anchor)', async () => {
    await db.accounts.put(acc({ id: 'acc-bca' }))
    const { balances } = await computeBalances()
    expect(balances.get('acc-bca')).toBe(0)
  })
})

describe('Balances: transfer-aware', () => {
  it('transfer out decreases source account', async () => {
    await db.accounts.bulkPut([
      acc({ id: 'acc-bca' }),
      acc({ id: 'acc-gopay', name: 'GoPay', account_type: 'digital_wallet' }),
    ])
    await db.transactions.put(txn({
      id: 't-salary', date: '2026-07-01', amount: 10_000_000, direction: 'in',
    }))
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 3_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const { balances, total } = await computeBalances()
    // BCA: 10jt in, 3jt transfer out = 7jt
    expect(balances.get('acc-bca')).toBe(7_000_000)
    // GoPay: 3jt transfer in = 3jt
    expect(balances.get('acc-gopay')).toBe(3_000_000)
    // Total unchanged: 10jt (transfer moves money, doesn't create/destroy)
    expect(total).toBe(10_000_000)
  })

  it('transfer between accounts does not change total balance', async () => {
    await db.accounts.bulkPut([
      acc({ id: 'acc-bca' }),
      acc({ id: 'acc-gopay', name: 'GoPay', account_type: 'digital_wallet' }),
    ])
    await db.transactions.bulkPut([
      txn({ id: 't-seed-a', date: '2026-07-01', amount: 5_000_000, direction: 'in', account_id: 'acc-bca' }),
      txn({ id: 't-seed-b', date: '2026-07-01', amount: 2_000_000, direction: 'in', account_id: 'acc-gopay' }),
    ])

    const before = await computeBalances()
    expect(before.total).toBe(7_000_000)

    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 1_500_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const after = await computeBalances()
    expect(after.total).toBe(7_000_000) // unchanged
  })
})

describe('Balances: manual override anchor', () => {
  it('anchor replaces balance; only later transactions count', async () => {
    await db.accounts.put(acc({
      id: 'acc-bca',
      manual_balance_override: 5_000_000,
      last_balance_updated_at: '2026-07-05T10:00:00.000Z',
    }))
    await db.transactions.bulkPut([
      // Before anchor day — ignored
      txn({ id: 't-before', date: '2026-07-04', amount: 500_000, direction: 'out' }),
      // Same day as anchor — ignored (date <= anchorDay)
      txn({ id: 't-sameday', date: '2026-07-05', amount: 300_000, direction: 'out' }),
      // After anchor day — counts
      txn({ id: 't-after', date: '2026-07-06', amount: 200_000, direction: 'out' }),
    ])

    const { balances } = await computeBalances()
    // 5,000,000 - 200,000 = 4,800,000
    expect(balances.get('acc-bca')).toBe(4_800_000)
  })

  it('override with no transactions after = just the override value', async () => {
    await db.accounts.put(acc({
      id: 'acc-bca',
      manual_balance_override: 8_000_000,
      last_balance_updated_at: '2026-07-10T00:00:00.000Z',
    }))
    await db.transactions.put(txn({
      id: 't-old', date: '2026-07-08', amount: 500_000, direction: 'out',
    }))

    const { balances } = await computeBalances()
    expect(balances.get('acc-bca')).toBe(8_000_000)
  })

  it('updating override recalculates from new anchor', async () => {
    await db.accounts.put(acc({
      id: 'acc-bca',
      manual_balance_override: 3_000_000,
      last_balance_updated_at: '2026-07-05T00:00:00.000Z',
    }))
    await db.transactions.put(txn({
      id: 't-after', date: '2026-07-06', amount: 500_000, direction: 'out',
    }))

    const before = await computeBalances()
    expect(before.balances.get('acc-bca')).toBe(2_500_000)

    // User corrects balance
    await db.accounts.update('acc-bca', {
      manual_balance_override: 4_000_000,
      last_balance_updated_at: '2026-07-06T12:00:00.000Z',
    })

    const after = await computeBalances()
    // New anchor 4jt, txn on 2026-07-06 is same day as new anchor → ignored
    expect(after.balances.get('acc-bca')).toBe(4_000_000)
  })
})

describe('Balances: deletion and isolation', () => {
  it('deleted transaction no longer affects balance', async () => {
    await db.accounts.put(acc({ id: 'acc-bca' }))
    await db.transactions.bulkPut([
      txn({ id: 't-salary', date: '2026-07-01', amount: 10_000_000, direction: 'in' }),
      txn({ id: 't-coffee', date: '2026-07-05', amount: 50_000, direction: 'out' }),
    ])

    const before = await computeBalances()
    expect(before.balances.get('acc-bca')).toBe(9_950_000)

    await db.transactions.delete('t-coffee')
    const after = await computeBalances()
    expect(after.balances.get('acc-bca')).toBe(10_000_000)
  })

  it('transactions on other accounts do not affect this account', async () => {
    await db.accounts.bulkPut([
      acc({ id: 'acc-bca' }),
      acc({ id: 'acc-gopay', name: 'GoPay', account_type: 'digital_wallet' }),
    ])
    await db.transactions.bulkPut([
      txn({ id: 't-bca-in', date: '2026-07-01', amount: 5_000_000, direction: 'in', account_id: 'acc-bca' }),
      txn({ id: 't-gopay-in', date: '2026-07-01', amount: 3_000_000, direction: 'in', account_id: 'acc-gopay' }),
      txn({ id: 't-gopay-out', date: '2026-07-05', amount: 1_000_000, direction: 'out', account_id: 'acc-gopay' }),
    ])

    const { balances } = await computeBalances()
    expect(balances.get('acc-bca')).toBe(5_000_000)
    expect(balances.get('acc-gopay')).toBe(2_000_000)
  })
})

describe('Balances: inactive accounts excluded', () => {
  it('inactive accounts are not included in totals', async () => {
    await db.accounts.bulkPut([
      acc({ id: 'acc-bca' }),
      acc({ id: 'acc-old', name: 'Old Bank', is_active: false }),
    ])
    await db.transactions.bulkPut([
      txn({ id: 't-bca', date: '2026-07-01', amount: 5_000_000, direction: 'in', account_id: 'acc-bca' }),
      txn({ id: 't-old', date: '2026-07-01', amount: 3_000_000, direction: 'in', account_id: 'acc-old' }),
    ])

    const { balances, total } = await computeBalances()
    expect(balances.has('acc-bca')).toBe(true)
    expect(balances.has('acc-old')).toBe(false)
    expect(total).toBe(5_000_000)
  })
})

describe('Balances: deterministic', () => {
  it('same data produces same result', async () => {
    await db.accounts.bulkPut([
      acc({ id: 'acc-bca' }),
      acc({ id: 'acc-gopay', name: 'GoPay', account_type: 'digital_wallet' }),
    ])
    await db.transactions.bulkPut([
      txn({ id: 't-salary', date: '2026-07-01', amount: 12_000_000, direction: 'in' }),
      txn({ id: 't-rent', date: '2026-07-02', amount: 3_000_000, direction: 'out' }),
    ])
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 2_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const r1 = await computeBalances()
    const r2 = await computeBalances()
    expect(r1).toEqual(r2)
  })
})
