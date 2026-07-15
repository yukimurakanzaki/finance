import type { Transaction } from '@db/types'
import { describe, expect, it } from 'vitest'
import { isWeekDraw } from './useSafeToSpend'

const txn = (over: Partial<Transaction>): Transaction => ({
  id: 't1',
  date: '2026-07-07',
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

describe('isWeekDraw (personal-pool draw filter)', () => {
  it('an untagged outgoing spend draws the pool', () => {
    expect(isWeekDraw(txn({}))).toBe(true)
  })
  it('a recurring-tagged committed payment does NOT draw the pool', () => {
    expect(isWeekDraw(txn({ recurring_item_id: 'rec-1' }))).toBe(false)
  })
  it('transfers and pass-through never draw the pool', () => {
    expect(isWeekDraw(txn({ is_transfer: true }))).toBe(false)
    expect(isWeekDraw(txn({ lane: 'pass_through' }))).toBe(false)
  })
  it('income never draws the pool', () => {
    expect(isWeekDraw(txn({ direction: 'in' }))).toBe(false)
  })
})
