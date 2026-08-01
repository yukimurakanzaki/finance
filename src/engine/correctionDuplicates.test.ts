// D1 edge case 7 — two devices correcting the same account offline both apply,
// leaving the balance wrong by the duplicate. Unlike a last-write-wins field
// overwrite, this cannot resolve itself once both rows sync.
//
// The hard part is that a duplicate and a legitimate second correction look
// identical from the outside: same account, same day, two rows. What separates
// them is what each one *saw*. A device that corrected after seeing the first
// correction starts from its result; a device that never saw it starts from the
// same stale balance.
import { describe, expect, it } from 'vitest'
import type { BalanceCorrection } from '@db/types'
import { findDuplicateCorrections } from './correctionDuplicates'

const row = (over: Partial<BalanceCorrection>): BalanceCorrection => ({
  id: 'c1',
  account_id: 'acc1',
  transaction_id: 't1',
  reverts_id: null,
  previous_balance: 690_000,
  new_balance: 412_000,
  as_of_date: '2026-07-31',
  note: null,
  created_at: '2026-07-31T10:00:00.000Z',
  ...over,
})

describe('findDuplicateCorrections', () => {
  it('flags two corrections that both started from the same balance', () => {
    const groups = findDuplicateCorrections([
      row({ id: 'a' }),
      row({ id: 'b', created_at: '2026-07-31T10:00:05.000Z' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.ids).toEqual(['a', 'b'])
    expect(groups[0]?.account_id).toBe('acc1')
    expect(groups[0]?.as_of_date).toBe('2026-07-31')
  })

  it('does not flag a second correction that saw the first', () => {
    // The device corrected 690.000 → 412.000, then corrected again from 412.000.
    // Both are deliberate; the second is not a duplicate of the first.
    const groups = findDuplicateCorrections([
      row({ id: 'a' }),
      row({ id: 'b', previous_balance: 412_000, new_balance: 400_000 }),
    ])
    expect(groups).toEqual([])
  })

  it('flags two devices that disagreed as well as two that agreed', () => {
    // Same stale starting point, different answers — both applied, both wrong.
    const groups = findDuplicateCorrections([
      row({ id: 'a', new_balance: 412_000 }),
      row({ id: 'b', new_balance: 500_000 }),
    ])
    expect(groups).toHaveLength(1)
  })

  it('does not flag corrections on different days', () => {
    expect(
      findDuplicateCorrections([
        row({ id: 'a' }),
        row({ id: 'b', as_of_date: '2026-07-30' }),
      ]),
    ).toEqual([])
  })

  it('does not flag corrections on different accounts', () => {
    expect(
      findDuplicateCorrections([
        row({ id: 'a' }),
        row({ id: 'b', account_id: 'acc2' }),
      ]),
    ).toEqual([])
  })

  it('ignores reverting rows', () => {
    // An undo shares the account and day and mirrors the balances. It is the
    // resolution of a correction, not a competing one.
    expect(
      findDuplicateCorrections([
        row({ id: 'a' }),
        row({ id: 'b', reverts_id: 'a', previous_balance: 412_000, new_balance: 690_000 }),
      ]),
    ).toEqual([])
  })

  it('does not flag a correction that has already been reverted', () => {
    // Once one side of a duplicate is undone, the collision is resolved and
    // must stop nagging.
    expect(
      findDuplicateCorrections([
        row({ id: 'a' }),
        row({ id: 'b', created_at: '2026-07-31T10:00:05.000Z' }),
        row({ id: 'r', reverts_id: 'b', previous_balance: 412_000, new_balance: 690_000 }),
      ]),
    ).toEqual([])
  })

  it('groups three colliding corrections as one problem, not three pairs', () => {
    const groups = findDuplicateCorrections([
      row({ id: 'a' }),
      row({ id: 'b' }),
      row({ id: 'c' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.ids).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing for a single correction', () => {
    expect(findDuplicateCorrections([row({})])).toEqual([])
  })
})
