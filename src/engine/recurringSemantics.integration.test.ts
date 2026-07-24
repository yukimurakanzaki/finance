// M1 Product Integrity Audit — Recurring semantics integration test.
// Recurring Invariant:
//   Recurring items represent committed financial obligations.
//   They are configuration objects, not spending events.
//   A transaction linked to a recurring item records execution.
//   The same obligation must never reduce discretionary capacity twice.
//
// This file pins the behavior that is currently correct. Known gap documented
// in REDESIGN-GAP-AUDIT.md: importBatch advances recurring next_due by note match
// but stores recurring_item_id=null, so imported recurring executions are not yet
// linked for safe-to-spend exclusion.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { recurringRepo } from '@db/repositories/recurringItems.repo'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { computeSafeToSpend, isWeekDraw } from '@engine/safeToSpend'
import type { Account, Allowance, Category, RecurringItem, Transaction } from '@db/types'

const TUE = new Date(2026, 6, 7)

const allowance: Allowance = {
  id: 'local', monthly_amount: 3_000_000, weekend_allocation: 400_000, updated_at: '',
}

const recurring = (over: Partial<RecurringItem>): RecurringItem => ({
  name: 'Netflix',
  amount: 150_000,
  cadence: 'monthly',
  kind: 'personal_sub',
  lane: 'protected_living',
  is_protected: false,
  is_active: true,
  next_due: '2026-07-01',
  end_date: null,
  note: null,
  created_at: '',
  ...over,
})

const txn = (over: Partial<Transaction>): Transaction => ({
  date: '2026-07-07',
  amount: 150_000,
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

const account: Account = {
  id: 'acc-bca', name: 'BCA', institution: 'BCA', account_type: 'bank',
  lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '',
}

const category: Category = {
  id: 'cat-sub', name: 'Subscriptions', lane: 'protected_living',
  is_protected: false, envelope_id: null,
}

async function activeRecurring() {
  return db.recurringItems.filter((r) => r.is_active).toArray()
}

beforeEach(async () => {
  await Promise.all([
    db.recurringItems.clear(),
    db.transactions.clear(),
    db.allowance.clear(),
    db.accounts.clear(),
    db.categories.clear(),
    db.netWorthSnapshots.clear(),
  ])
  await db.allowance.put(allowance)
  await db.accounts.put(account)
  await db.categories.put(category)
})

describe('Recurring semantics: configuration vs execution', () => {
  it('active recurring items are surfaced for display but do not shrink the discretionary pool again', async () => {
    const id = await recurringRepo.create(recurring({
      kind: 'personal_sub', amount: 500_000, name: 'Claude Pro',
    }) as Omit<RecurringItem, 'id' | 'created_at'>)

    const active = await activeRecurring()
    const withoutRecurring = computeSafeToSpend({ allowance, activeRecurringItems: [], spendThisWeek: 0, today: TUE })!
    const withRecurring = computeSafeToSpend({ allowance, activeRecurringItems: active, spendThisWeek: 0, today: TUE })!

    expect(active).toHaveLength(1)
    expect(active[0]!.id).toBe(id)
    expect(withRecurring.weekPool).toBe(withoutRecurring.weekPool)
    expect(withRecurring.remainingPool).toBe(withoutRecurring.remainingPool)
    expect(withRecurring.personalSubTotal).toBe(500_000)
  })

  it('inactive recurring items are excluded from active commitment totals', async () => {
    const id = await recurringRepo.create(recurring({
      kind: 'personal_sub', amount: 500_000, name: 'Netflix',
    }) as Omit<RecurringItem, 'id' | 'created_at'>)
    await recurringRepo.deactivate(id as string)

    const active = await activeRecurring()
    const r = computeSafeToSpend({ allowance, activeRecurringItems: active, spendThisWeek: 0, today: TUE })!

    expect(active).toHaveLength(0)
    expect(r.personalSubTotal).toBe(0)
  })

  it('linked recurring execution transaction does not draw safe-to-spend', () => {
    const linkedPayment = txn({ recurring_item_id: 'rec-netflix', amount: 150_000 })
    expect(isWeekDraw(linkedPayment)).toBe(false)
  })

  it('unlinked transaction with same merchant/amount does draw safe-to-spend', () => {
    const unlinkedPayment = txn({ recurring_item_id: null, amount: 150_000, title: 'Netflix' })
    expect(isWeekDraw(unlinkedPayment)).toBe(true)
  })

  it('linked recurring payment prevents double counting: displayed recurring total plus zero draw', () => {
    const active = [recurring({ id: 'rec-netflix', amount: 150_000, kind: 'personal_sub' })]
    const linkedPayment = txn({ recurring_item_id: 'rec-netflix', amount: 150_000 })
    const spendThisWeek = isWeekDraw(linkedPayment) ? linkedPayment.amount : 0

    const r = computeSafeToSpend({ allowance, activeRecurringItems: active, spendThisWeek, today: TUE })!

    expect(r.personalSubTotal).toBe(150_000)
    expect(r.spentThisWeek).toBe(0)
    expect(r.remainingPool).toBe(r.weekPool)
  })

  it('deleted linked recurring payment restores zero draw', async () => {
    await db.transactions.put(txn({ id: 't-netflix', recurring_item_id: 'rec-netflix', amount: 150_000 }))
    const before = (await db.transactions.toArray()).filter(isWeekDraw).reduce((s, t) => s + t.amount, 0)
    expect(before).toBe(0)

    await db.transactions.delete('t-netflix')
    const after = (await db.transactions.toArray()).filter(isWeekDraw).reduce((s, t) => s + t.amount, 0)
    expect(after).toBe(0)
  })

  it('editing recurring amount changes displayed commitment total, not week pool', async () => {
    const id = await recurringRepo.create(recurring({
      kind: 'personal_sub', amount: 150_000, name: 'Netflix',
    }) as Omit<RecurringItem, 'id' | 'created_at'>)

    await recurringRepo.update(id as string, { amount: 200_000 })
    const active = await activeRecurring()
    const r = computeSafeToSpend({ allowance, activeRecurringItems: active, spendThisWeek: 0, today: TUE })!

    expect(r.personalSubTotal).toBe(200_000)
    expect(r.weekPool).toBe(650_000) // (3,000,000 - 400,000) / 4 weeks
  })
})

describe('Recurring semantics: import contract', () => {
  it('imported recurring payment links transaction, advances next_due, and does not draw safe-to-spend', async () => {
    const recId = await recurringRepo.create(recurring({
      name: 'Netflix', amount: 150_000, cadence: 'monthly', next_due: '2026-07-01',
    }) as Omit<RecurringItem, 'id' | 'created_at'>) as string

    await transactionsRepo.importBatch([
      {
        _row_index: 0,
        date: '2026-07-07',
        amount: 150_000,
        direction: 'out',
        account_id: 'acc-bca',
        category: 'Subscriptions',
        suggested_lane: 'protected_living',
        note: 'Netflix monthly subscription',
        _resolved_account: account,
        _resolved_category: category,
      },
    ], '2026-07', { income_producing: 0, store_of_value: 0, debt_liability: 0, protected_living: 0, pass_through: 0 }, 0)

    const imported = await db.transactions.toCollection().first()
    const updatedRecurring = await db.recurringItems.get(recId)

    expect(imported?.recurring_item_id).toBe(recId)
    expect(updatedRecurring?.next_due).toBe('2026-08-01')
    expect(isWeekDraw(imported!)).toBe(false)
  })

  it('imported non-recurring expense remains discretionary', async () => {
    await recurringRepo.create(recurring({
      name: 'Netflix', amount: 150_000, cadence: 'monthly', next_due: '2026-07-01',
    }) as Omit<RecurringItem, 'id' | 'created_at'>)

    await transactionsRepo.importBatch([
      {
        _row_index: 0,
        date: '2026-07-07',
        amount: 70_000,
        direction: 'out',
        account_id: 'acc-bca',
        category: 'Subscriptions',
        suggested_lane: 'protected_living',
        note: 'Lunch',
        _resolved_account: account,
        _resolved_category: category,
      },
    ], '2026-07', { income_producing: 0, store_of_value: 0, debt_liability: 0, protected_living: 0, pass_through: 0 }, 0)

    const imported = await db.transactions.toCollection().first()
    expect(imported?.recurring_item_id).toBeNull()
    expect(isWeekDraw(imported!)).toBe(true)
  })
})
