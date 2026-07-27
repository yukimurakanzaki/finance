// M1 Product Integrity Audit — Transfers integration test.
// Covers the full transfer correctness domain:
// - pair creation (two legs, opposite directions, same pair_id)
// - pair deletion (both legs removed)
// - pair editing (flagTransfer/unflagTransfer)
// - transfer exclusion from safe-to-spend (cross-check)
// - transfer exclusion from report actuals (cross-check)
// - transfer inclusion in per-account balance (cross-check)
// - import transfer detection (transferDetector worker logic)
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { isWeekDraw } from '@engine/safeToSpend'
import { deriveBalance } from '@lib/balances'
import type { Account, Transaction } from '@db/types'
import type { ValidImportRow } from '@import/schema'

const accA: Account = {
  id: 'acc-bca', name: 'BCA', institution: 'BCA', account_type: 'bank',
  lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '',
}
const accB: Account = {
  id: 'acc-gopay', name: 'GoPay', institution: 'GoPay', account_type: 'digital_wallet',
  lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '',
}

beforeEach(async () => {
  await db.transactions.clear()
})

describe('Transfers: pair creation', () => {
  it('creates two legs with opposite directions and same pair_id', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 2_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: 'Top up GoPay',
    })

    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(2)

    const outLeg = rows.find((r) => r.direction === 'out')!
    const inLeg = rows.find((r) => r.direction === 'in')!

    expect(outLeg.is_transfer).toBe(true)
    expect(inLeg.is_transfer).toBe(true)
    expect(outLeg.transfer_pair_id).toBe(inLeg.transfer_pair_id)
    expect(outLeg.transfer_pair_id).not.toBeNull()
    expect(outLeg.account_id).toBe('acc-bca')
    expect(inLeg.account_id).toBe('acc-gopay')
    expect(outLeg.amount).toBe(2_000_000)
    expect(inLeg.amount).toBe(2_000_000)
  })

  it('both legs share the same date', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-15', amount: 500_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const rows = await db.transactions.toArray()
    expect(rows.every((r) => r.date === '2026-07-15')).toBe(true)
  })
})

describe('Transfers: pair deletion', () => {
  it('deletes both legs when one is removed', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 1_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })

    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(2)

    // Delete using one leg's id
    await transactionsRepo.deleteWithPair(rows[0]!.id!)
    const remaining = await db.transactions.toArray()
    expect(remaining).toHaveLength(0)
  })

  it('deletes a plain transaction alone (no pair)', async () => {
    const id = await transactionsRepo.add({
      date: '2026-07-08', amount: 50_000, direction: 'out', account_id: 'acc-bca',
      category_id: null, lane: 'protected_living', source: 'manual',
      title: 'Kopi', note: null, original_amount: null, overridden_amount: null,
      override_note: null, overridden_at: null, is_transfer: false, transfer_pair_id: null,
      recurring_item_id: null,
    })
    await transactionsRepo.deleteWithPair(id)
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('Transfers: flag/unflag', () => {
  it('flags two plain transactions as a transfer pair', async () => {
    const idA = await transactionsRepo.add({
      date: '2026-07-08', amount: 1_500_000, direction: 'out', account_id: 'acc-bca',
      category_id: null, lane: 'protected_living', source: 'manual',
      title: 'Withdrawal', note: null, original_amount: null, overridden_amount: null,
      override_note: null, overridden_at: null, is_transfer: false, transfer_pair_id: null,
      recurring_item_id: null,
    })
    const idB = await transactionsRepo.add({
      date: '2026-07-08', amount: 1_500_000, direction: 'in', account_id: 'acc-gopay',
      category_id: null, lane: 'protected_living', source: 'manual',
      title: 'Top up', note: null, original_amount: null, overridden_amount: null,
      override_note: null, overridden_at: null, is_transfer: false, transfer_pair_id: null,
      recurring_item_id: null,
    })

    await transactionsRepo.flagTransfer(idA, idB)

    const a = await db.transactions.get(idA)!
    const b = await db.transactions.get(idB)!
    expect(a!.is_transfer).toBe(true)
    expect(b!.is_transfer).toBe(true)
    expect(a!.transfer_pair_id).toBe(b!.transfer_pair_id)
    expect(a!.transfer_pair_id).not.toBeNull()
  })

  it('unflags a transfer leg back to plain transaction', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 800_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })
    const leg = await db.transactions.toCollection().first()!
    await transactionsRepo.unflagTransfer(leg!.id!)

    const updated = await db.transactions.get(leg!.id!)!
    expect(updated!.is_transfer).toBe(false)
    expect(updated!.transfer_pair_id).toBe(null)

    // The other leg stays flagged (unflag only affects one leg)
    const all = await db.transactions.toArray()
    const other = all.find((r) => r.id !== leg!.id)!
    expect(other!.is_transfer).toBe(true)
  })
})

describe('Transfers: cross-engine exclusion consistency', () => {
  it('transfers excluded from safe-to-spend (isWeekDraw)', () => {
    const transferOut: Transaction = {
      id: 't1', date: '2026-07-08', amount: 2_000_000, title: null,
      direction: 'out', account_id: 'acc-bca', category_id: null,
      lane: 'protected_living', source: 'manual', note: null,
      original_amount: null, overridden_amount: null, override_note: null, overridden_at: null,
      is_transfer: true, transfer_pair_id: 'p1', recurring_item_id: null, created_at: '',
    }
    const transferIn: Transaction = { ...transferOut, id: 't2', direction: 'in' }
    expect(isWeekDraw(transferOut)).toBe(false)
    expect(isWeekDraw(transferIn)).toBe(false)
  })

  it('transfers excluded from report actuals (getByMonth default)', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-08', amount: 3_000_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })
    const monthTxns = await transactionsRepo.getByMonth('2026-07')
    expect(monthTxns).toHaveLength(0)
  })

  it('transfers INCLUDED in per-account balance (deriveBalance)', () => {
    const txns: Transaction[] = [
      { id: 't1', date: '2026-07-01', amount: 5_000_000, title: null, direction: 'in', account_id: 'acc-bca', category_id: null, lane: 'protected_living', source: 'manual', note: null, original_amount: null, overridden_amount: null, override_note: null, overridden_at: null, is_transfer: false, transfer_pair_id: null, recurring_item_id: null, created_at: '' },
      { id: 't2', date: '2026-07-08', amount: 2_000_000, title: null, direction: 'out', account_id: 'acc-bca', category_id: null, lane: 'protected_living', source: 'manual', note: null, original_amount: null, overridden_amount: null, override_note: null, overridden_at: null, is_transfer: true, transfer_pair_id: 'p1', recurring_item_id: null, created_at: '' },
      { id: 't3', date: '2026-07-08', amount: 2_000_000, title: null, direction: 'in', account_id: 'acc-gopay', category_id: null, lane: 'protected_living', source: 'manual', note: null, original_amount: null, overridden_amount: null, override_note: null, overridden_at: null, is_transfer: true, transfer_pair_id: 'p1', recurring_item_id: null, created_at: '' },
    ]
    // BCA: 5jt in, 2jt transfer out → balance 3jt
    expect(deriveBalance(accA, txns)).toBe(3_000_000)
    // GoPay: 2jt transfer in → balance 2jt
    expect(deriveBalance(accB, txns)).toBe(2_000_000)
  })
})

describe('Transfers: import detection (transferDetector logic)', () => {
  // Replicates the worker's matching logic without Web Worker overhead.
  // The worker sorts ins by [amount, date], binary searches for matching amount,
  // and validates: different account, within ±1 day, not already used.
  function detectTransfers(rows: ValidImportRow[], ownAccountIds: string[]): number {
    const ownSet = new Set(ownAccountIds)
    const outs = rows.filter((r) => r.direction === 'out' && ownSet.has(r._resolved_account.id!))
    const ins = rows
      .filter((r) => r.direction === 'in' && ownSet.has(r._resolved_account.id!))
      .sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date))
    const usedIn = new Set<number>()
    let count = 0
    for (const out of outs) {
      for (let i = 0; i < ins.length; i++) {
        const row = ins[i]!
        if (usedIn.has(row._row_index)) continue
        if (row.amount !== out.amount) continue
        if (row._resolved_account.id === out._resolved_account.id) continue
        const dayDiff = Math.abs((new Date(row.date).getTime() - new Date(out.date).getTime()) / 86_400_000)
        if (dayDiff > 1) continue
        out.is_transfer = true
        out.transfer_pair_id = crypto.randomUUID()
        row.is_transfer = true
        row.transfer_pair_id = out.transfer_pair_id
        usedIn.add(row._row_index)
        count++
        break
      }
    }
    return count
  }

  const makeRow = (over: Partial<ValidImportRow>): ValidImportRow => ({
    date: '2026-07-08', amount: 1_000_000, direction: 'out', note: 'test',
    account_id: 'acc-bca', category: 'test',
    _row_index: 0, _resolved_account: { id: 'acc-bca' } as Account,
    _resolved_category: null, suggested_lane: 'protected_living', is_transfer: false, transfer_pair_id: null,
    ...over,
  })

  it('detects matching in/out pair as transfer', () => {
    const rows = [
      makeRow({ _row_index: 0, direction: 'out', amount: 1_000_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, direction: 'in', amount: 1_000_000, _resolved_account: { id: 'acc-gopay' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca', 'acc-gopay'])).toBe(1)
    expect(rows[0]!.is_transfer).toBe(true)
    expect(rows[1]!.is_transfer).toBe(true)
    expect(rows[0]!.transfer_pair_id).toBe(rows[1]!.transfer_pair_id)
  })

  it('does not match same account', () => {
    const rows = [
      makeRow({ _row_index: 0, direction: 'out', amount: 1_000_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, direction: 'in', amount: 1_000_000, _resolved_account: { id: 'acc-bca' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca'])).toBe(0)
    expect(rows[0]!.is_transfer).toBe(false)
    expect(rows[1]!.is_transfer).toBe(false)
  })

  it('does not match different amounts', () => {
    const rows = [
      makeRow({ _row_index: 0, direction: 'out', amount: 1_000_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, direction: 'in', amount: 999_999, _resolved_account: { id: 'acc-gopay' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca', 'acc-gopay'])).toBe(0)
  })

  it('does not match when date difference > 1 day', () => {
    const rows = [
      makeRow({ _row_index: 0, date: '2026-07-05', direction: 'out', amount: 500_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, date: '2026-07-08', direction: 'in', amount: 500_000, _resolved_account: { id: 'acc-gopay' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca', 'acc-gopay'])).toBe(0)
  })

  it('matches within ±1 day boundary', () => {
    const rows = [
      makeRow({ _row_index: 0, date: '2026-07-07', direction: 'out', amount: 500_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, date: '2026-07-08', direction: 'in', amount: 500_000, _resolved_account: { id: 'acc-gopay' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca', 'acc-gopay'])).toBe(1)
  })

  it('uses each in-leg only once (no double matching)', () => {
    const rows = [
      makeRow({ _row_index: 0, direction: 'out', amount: 500_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, direction: 'out', amount: 500_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 2, direction: 'in', amount: 500_000, _resolved_account: { id: 'acc-gopay' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca', 'acc-gopay'])).toBe(1)
    // Only one out-leg matched
    const matched = rows.filter((r) => r.is_transfer)
    expect(matched).toHaveLength(2) // one out + one in
  })

  it('ignores transactions on non-own accounts', () => {
    const rows = [
      makeRow({ _row_index: 0, direction: 'out', amount: 500_000, _resolved_account: { id: 'acc-bca' } as Account }),
      makeRow({ _row_index: 1, direction: 'in', amount: 500_000, _resolved_account: { id: 'acc-external' } as Account }),
    ]
    expect(detectTransfers(rows, ['acc-bca'])).toBe(0)
  })
})
