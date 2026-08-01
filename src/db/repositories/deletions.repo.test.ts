// Deletes have to survive sync. The watermark engine pushes rows that changed
// since the last push — a row deleted locally simply stops being pushed, so the
// cloud copy lives on and every other device keeps it forever. On this device
// it stays gone until a fresh hydrate pulls it straight back.
//
// A deletion log fixes that without tombstoning the rows themselves: the local
// row is genuinely removed (so all ~55 read sites keep working untouched) and a
// small synced record says it was deleted.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@db/db'
import { deletionsRepo } from './deletions.repo'
import { transactionsRepo } from './transactions.repo'
import { correctionsRepo } from './corrections.repo'
import type { Account, Transaction } from '@db/types'

const ACC = '11111111-1111-4111-8111-111111111111'
const ACC2 = '99999999-9999-4999-8999-999999999999'

const txn = (over: Partial<Transaction>): Transaction => ({
  date: '2026-07-10',
  amount: 50_000,
  title: null,
  direction: 'out',
  account_id: ACC,
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

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.accounts.clear(),
    db.deletions.clear(),
    db.balanceCorrections.clear(),
  ])
  const account: Account = {
    id: ACC,
    name: 'BCA',
    institution: 'BCA',
    account_type: 'bank',
    lane: 'protected_living',
    currency: 'IDR',
    is_protected: false,
    is_active: true,
    manual_balance_override: null,
    last_balance_updated_at: null,
    created_at: '',
  }
  await db.accounts.bulkPut([account, { ...account, id: ACC2, name: 'GoPay' }])
})

describe('deletionsRepo.remove', () => {
  it('removes the row and records that it was deleted', async () => {
    await db.transactions.put(txn({ id: 'tx-1' }))

    await deletionsRepo.remove('transactions', 'tx-1')

    expect(await db.transactions.get('tx-1')).toBeUndefined()
    const [tombstone] = await db.deletions.toArray()
    expect(tombstone).toMatchObject({ table_name: 'transactions', row_id: 'tx-1' })
  })

  it('is idempotent — deleting twice leaves one record', async () => {
    await db.transactions.put(txn({ id: 'tx-1' }))
    await deletionsRepo.remove('transactions', 'tx-1')
    await deletionsRepo.remove('transactions', 'tx-1')
    expect(await db.deletions.count()).toBe(1)
  })
})

describe('deletionsRepo.apply', () => {
  it('deletes a row this device still has but another device removed', async () => {
    await db.transactions.put(txn({ id: 'tx-remote' }))
    // Arrived from the other device via the normal pull.
    await db.deletions.put({
      id: 'tx-remote',
      table_name: 'transactions',
      row_id: 'tx-remote',
      created_at: '2026-07-31T10:00:00.000Z',
    })

    await deletionsRepo.apply()

    expect(await db.transactions.get('tx-remote')).toBeUndefined()
  })

  it('is harmless when the row is already gone', async () => {
    await db.deletions.put({
      id: 'tx-gone',
      table_name: 'transactions',
      row_id: 'tx-gone',
      created_at: '2026-07-31T10:00:00.000Z',
    })
    await expect(deletionsRepo.apply()).resolves.not.toThrow()
  })

  it('ignores a tombstone naming a table it does not know', async () => {
    await db.deletions.put({
      id: 'x',
      table_name: 'not_a_table',
      row_id: 'x',
      created_at: '2026-07-31T10:00:00.000Z',
    })
    await expect(deletionsRepo.apply()).resolves.not.toThrow()
  })
})

describe('existing delete paths record tombstones', () => {
  it('deleting a transfer tombstones both legs', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-10',
      amount: 100_000,
      from_account_id: ACC,
      from_lane: 'protected_living',
      to_account_id: ACC2,
      to_lane: 'protected_living',
      note: null,
    })
    const legs = await db.transactions.toArray()
    expect(legs).toHaveLength(2)

    await transactionsRepo.deleteWithPair(legs[0]?.id as string)

    expect(await db.transactions.count()).toBe(0)
    const tombstoned = (await db.deletions.toArray()).map((d) => d.row_id).sort()
    expect(tombstoned).toEqual(legs.map((l) => l.id as string).sort())
  })

  it('deleting a plain transaction tombstones it', async () => {
    await db.transactions.put(txn({ id: 'tx-solo' }))
    await transactionsRepo.deleteWithPair('tx-solo')
    expect(await db.deletions.count()).toBe(1)
  })

  // The bug that prompted this: an undo that quietly comes back is worse than
  // no undo at all.
  it('undoing a balance correction tombstones the adjustment it removes', async () => {
    await db.transactions.put(txn({ id: 'tx-seed', amount: 690_000, direction: 'in' }))
    const res = await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })
    if (!res.ok) throw new Error('correction refused')

    await correctionsRepo.revert(res.correction_id)

    const [tombstone] = await db.deletions.toArray()
    expect(tombstone).toMatchObject({
      table_name: 'transactions',
      row_id: res.transaction_id,
    })
  })
})
