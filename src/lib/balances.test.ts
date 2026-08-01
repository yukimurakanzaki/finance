import { describe, it, expect } from 'vitest'
import { deriveBalance, overdraftSince, splitOverdraft } from './balances'
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
  is_transfer: false, transfer_pair_id: null, recurring_item_id: null, created_at: '', ...over,
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

describe('splitOverdraft', () => {
  // NFR-3.2: positive, zero, negative. Money math, non-negotiable.
  it('a positive balance is all asset, no liability', () => {
    expect(splitOverdraft(1_500_000)).toEqual({
      assetPortion: 1_500_000,
      overdraftLiability: 0,
    })
  })

  it('zero is neither', () => {
    expect(splitOverdraft(0)).toEqual({ assetPortion: 0, overdraftLiability: 0 })
  })

  it('a negative balance is all liability, no asset', () => {
    expect(splitOverdraft(-250_000)).toEqual({
      assetPortion: 0,
      overdraftLiability: 250_000,
    })
  })

  it('never returns a negative on either side', () => {
    for (const b of [-1, 0, 1, -999_999, 999_999]) {
      const { assetPortion, overdraftLiability } = splitOverdraft(b)
      expect(assetPortion).toBeGreaterThanOrEqual(0)
      expect(overdraftLiability).toBeGreaterThanOrEqual(0)
    }
  })

  it('routing through the split preserves net worth', () => {
    // The whole point of FR-3.3: lanes change, the total must not. Net worth
    // subtracts debt_liability, so assetPortion - overdraftLiability must equal
    // the raw signed balance for every input.
    for (const b of [1_000_000, 0, -400_000, -1, 7]) {
      const { assetPortion, overdraftLiability } = splitOverdraft(b)
      expect(assetPortion - overdraftLiability).toBe(b)
    }
  })

  it('an overdrawn account lands in debt_liability, not a negative lane', () => {
    const balance = deriveBalance(
      acc({ lane: 'income_producing' }),
      [txn({ direction: 'out', amount: 300_000 })],
    )
    expect(balance).toBe(-300_000)

    const byLane = { income_producing: 0, debt_liability: 0 }
    const { assetPortion, overdraftLiability } = splitOverdraft(balance)
    byLane.income_producing += assetPortion
    byLane.debt_liability += overdraftLiability

    expect(byLane.income_producing).toBe(0)
    expect(byLane.debt_liability).toBe(300_000)
    // assets - overdraft, i.e. the same total the raw negative would have given
    expect(byLane.income_producing - byLane.debt_liability).toBe(-300_000)
  })
})

describe('overdraftSince', () => {
  it('returns null when the account is not overdrawn', () => {
    expect(overdraftSince(acc({}), [txn({ direction: 'in', amount: 500 })])).toBe(
      null,
    )
  })

  it('reports the date the balance first crossed below zero', () => {
    const txns = [
      txn({ id: 't1', date: '2026-07-01', direction: 'in', amount: 500 }),
      txn({ id: 't2', date: '2026-07-04', direction: 'out', amount: 700 }),
    ]
    expect(overdraftSince(acc({}), txns)).toBe('2026-07-04')
  })

  it('going further negative does not move the date', () => {
    const txns = [
      txn({ id: 't1', date: '2026-07-04', direction: 'out', amount: 100 }),
      txn({ id: 't2', date: '2026-07-09', direction: 'out', amount: 100 }),
    ]
    expect(overdraftSince(acc({}), txns)).toBe('2026-07-04')
  })

  it('recovering to zero clears the date, and a later dip starts a new one', () => {
    const txns = [
      txn({ id: 't1', date: '2026-07-04', direction: 'out', amount: 100 }),
      txn({ id: 't2', date: '2026-07-05', direction: 'in', amount: 100 }),
      txn({ id: 't3', date: '2026-07-20', direction: 'out', amount: 50 }),
    ]
    expect(overdraftSince(acc({}), txns)).toBe('2026-07-20')
  })

  it('reads unordered input in date order, not array order', () => {
    const txns = [
      txn({ id: 't2', date: '2026-07-09', direction: 'out', amount: 100 }),
      txn({ id: 't1', date: '2026-07-04', direction: 'in', amount: 50 }),
    ]
    expect(overdraftSince(acc({}), txns)).toBe('2026-07-09')
  })

  it('dates the crossing from a negative anchor', () => {
    const a = acc({
      manual_balance_override: -75_000,
      last_balance_updated_at: '2026-07-05T10:00:00.000Z',
    })
    expect(overdraftSince(a, [])).toBe('2026-07-05')
  })

  it('returns null when overdrawn but the crossing predates the ledger', () => {
    // Negative anchor with no date to attribute it to: the row renders the bare
    // "Overdrawn" badge rather than inventing a date.
    const a = acc({ manual_balance_override: -75_000, last_balance_updated_at: null })
    expect(overdraftSince(a, [])).toBe(null)
  })
})
