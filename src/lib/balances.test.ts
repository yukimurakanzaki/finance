import { describe, it, expect } from 'vitest'
import { deriveBalance } from './balances'
import type { Account, Transaction } from '@db/types'

const acc = (over: Partial<Account>): Account => ({
  id: 'a1', name: 'BCA', institution: 'BCA', account_type: 'bank',
  lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '', ...over,
})

const txn = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-01', amount: 100, direction: 'out', account_id: 'a1',
  category_id: null, lane: 'protected_living', source: 'manual', title: null, note: null,
  original_amount: null, overridden_amount: null, override_note: null, overridden_at: null,
  is_transfer: false, transfer_pair_id: null, created_at: '', ...over,
})

describe('deriveBalance', () => {
  it('sums in minus out with no anchor', () => {
    const txns = [
      txn({ direction: 'in', amount: 500 }),
      txn({ id: 't2', direction: 'out', amount: 120 }),
    ]
    expect(deriveBalance(acc({}), txns)).toBe(380)
  })

  it('includes transfer legs (unlike net worth math)', () => {
    const txns = [
      txn({ direction: 'in', amount: 500 }),
      txn({ id: 't2', direction: 'out', amount: 200, is_transfer: true, transfer_pair_id: 'p1' }),
    ]
    expect(deriveBalance(acc({}), txns)).toBe(300)
  })

  it('ignores other accounts', () => {
    expect(deriveBalance(acc({}), [txn({ account_id: 'other', direction: 'in', amount: 999 })])).toBe(0)
  })

  it('anchors at manual_balance_override and only counts later days', () => {
    const a = acc({ manual_balance_override: 1000, last_balance_updated_at: '2026-07-05T10:00:00.000Z' })
    const txns = [
      txn({ date: '2026-07-04', direction: 'out', amount: 400 }),
      txn({ id: 't2', date: '2026-07-05', direction: 'out', amount: 300 }),
      txn({ id: 't3', date: '2026-07-06', direction: 'out', amount: 250 }),
    ]
    expect(deriveBalance(a, txns)).toBe(750)
  })
})
