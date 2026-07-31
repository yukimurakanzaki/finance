// D2 — deleting accounts and assets for real, without orphaning anything.
//
// An account with history cannot simply vanish: its transactions would keep a
// dead account_id, and every account-grouped view would have to grow a "what if
// it's missing" path. So delete is refused while history exists, and the way out
// is to move that history or to deactivate instead — never to delete it.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@db/db'
import { accountsRepo } from './accounts.repo'
import { assetsRepo } from './assets.repo'
import { correctionsRepo } from './corrections.repo'
import type { Account, Asset, Transaction } from '@db/types'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const account = (over: Partial<Account> = {}): Account => ({
  id: A,
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
  ...over,
})

const txn = (over: Partial<Transaction>): Transaction => ({
  date: '2026-07-10',
  amount: 50_000,
  title: null,
  direction: 'out',
  account_id: A,
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

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'Antam 10g',
  lane: 'store_of_value',
  asset_type: 'gold',
  value: 12_000_000,
  quantity_grams: 10,
  price_per_gram: 1_200_000,
  auto_price: null,
  fx_code: null,
  fx_amount: null,
  last_valued_at: '2026-07-01',
  note: null,
  created_at: '',
  ...over,
})

beforeEach(async () => {
  await Promise.all([
    db.accounts.clear(),
    db.transactions.clear(),
    db.assets.clear(),
    db.deletions.clear(),
    db.balanceCorrections.clear(),
  ])
  await db.accounts.bulkPut([account(), account({ id: B, name: 'GoPay' })])
})

describe('accountsRepo.deleteAccount', () => {
  it('deletes an account with no history and tombstones it', async () => {
    const result = await accountsRepo.deleteAccount(A)

    expect(result).toEqual({ ok: true })
    expect(await db.accounts.get(A)).toBeUndefined()
    const [tombstone] = await db.deletions.toArray()
    expect(tombstone).toMatchObject({ table_name: 'accounts', row_id: A })
  })

  it('refuses while transactions still reference it, and reports how many', async () => {
    await db.transactions.bulkPut([
      txn({ id: 't1' }),
      txn({ id: 't2', amount: 20_000 }),
    ])

    const result = await accountsRepo.deleteAccount(A)

    expect(result).toEqual({ ok: false, reason: 'has_transactions', count: 2 })
    expect(await db.accounts.get(A)).toBeDefined()
  })

  it('never deletes the transactions as a side effect of a refused delete', async () => {
    await db.transactions.put(txn({ id: 't1' }))
    await accountsRepo.deleteAccount(A)
    expect(await db.transactions.count()).toBe(1)
  })

  it('counts balance corrections as history too', async () => {
    // An adjustment is an ordinary transaction on the account. If it didn't
    // count, deleting would leave it orphaned with a dead account_id.
    await db.transactions.put(txn({ id: 't-adj', is_adjustment: true }))
    expect(await accountsRepo.deleteAccount(A)).toMatchObject({
      ok: false,
      reason: 'has_transactions',
      count: 1,
    })
  })
})

describe('accountsRepo.moveTransactions', () => {
  it('moves every transaction to the target account', async () => {
    await db.transactions.bulkPut([txn({ id: 't1' }), txn({ id: 't2' })])

    const moved = await accountsRepo.moveTransactions(A, B)

    expect(moved).toBe(2)
    expect(await db.transactions.where('account_id').equals(A).count()).toBe(0)
    expect(await db.transactions.where('account_id').equals(B).count()).toBe(2)
  })

  it('moves balance corrections along with everything else', async () => {
    // Edge case 11 — miss these and the account can never be deleted, because
    // the refusal keeps counting rows the move left behind.
    await db.transactions.put(txn({ id: 't-seed', amount: 690_000, direction: 'in' }))
    const res = await correctionsRepo.correctBalance({
      accountId: A,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })
    if (!res.ok) throw new Error('correction refused')

    await accountsRepo.moveTransactions(A, B)

    const adjustment = await db.transactions.get(res.transaction_id)
    expect(adjustment?.account_id).toBe(B)
    expect(await accountsRepo.deleteAccount(A)).toEqual({ ok: true })
  })

  it('leaves other accounts alone', async () => {
    await db.transactions.bulkPut([txn({ id: 't1' }), txn({ id: 't-other', account_id: B })])
    await accountsRepo.moveTransactions(A, B)
    expect(await db.transactions.where('account_id').equals(B).count()).toBe(2)
  })
})

describe('accountsRepo.reactivate', () => {
  it('brings a deactivated account back', async () => {
    await accountsRepo.deactivate(A)
    expect((await db.accounts.get(A))?.is_active).toBe(false)
    await accountsRepo.reactivate(A)
    expect((await db.accounts.get(A))?.is_active).toBe(true)
  })
})

describe('assetsRepo.remove', () => {
  it('deletes the asset and tombstones it so it stays deleted', async () => {
    await db.assets.put(asset())

    await assetsRepo.remove('asset-1')

    expect(await db.assets.get('asset-1')).toBeUndefined()
    const [tombstone] = await db.deletions.toArray()
    expect(tombstone).toMatchObject({ table_name: 'assets', row_id: 'asset-1' })
  })

  it('leaves past net-worth snapshots untouched', async () => {
    // The asset leaves net worth from today. History is a record of what was
    // true then, not a live view.
    await db.assets.put(asset())
    await db.netWorthSnapshots.put({
      id: 'snap-1',
      year_month: '2026-06',
      total: 50_000_000,
      by_lane: {
        income_producing: 0,
        store_of_value: 12_000_000,
        debt_liability: 0,
        protected_living: 0,
        pass_through: 0,
      },
      taken_at: '',
    })

    await assetsRepo.remove('asset-1')

    expect((await db.netWorthSnapshots.get('snap-1'))?.total).toBe(50_000_000)
  })
})

describe('moved history actually syncs', () => {
  it('stamps updated_at so the push watermark picks the rows up', async () => {
    // Dexie's .modify() bypasses the updating hook that stamps updated_at
    // (db.ts v12 documents this). A move that leaves updated_at untouched is
    // invisible to the watermark push: this device shows the new account, every
    // other device keeps the old one, forever.
    await db.transactions.put(txn({ id: 't1', updated_at: '2020-01-01T00:00:00.000Z' } as Partial<Transaction>))

    await accountsRepo.moveTransactions(A, B)

    const moved = await db.transactions.get('t1')
    expect(moved?.account_id).toBe(B)
    expect((moved as { updated_at?: string }).updated_at).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('moves the audit trail with the history it describes', async () => {
    // A correction row records "this account went from X to Y". Leaving it
    // pointing at an account that is about to be deleted orphans it locally,
    // while the cloud FK cascades it away — the two diverge.
    await db.transactions.put(txn({ id: 't-seed', amount: 690_000, direction: 'in' }))
    await correctionsRepo.correctBalance({
      accountId: A,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })

    await accountsRepo.moveTransactions(A, B)

    const [audit] = await db.balanceCorrections.toArray()
    expect(audit?.account_id).toBe(B)
  })
})
