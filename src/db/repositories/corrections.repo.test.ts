// D1 — the correction write path, end to end against a real Dexie.
// Pins the contract the UI and the AI tool both depend on: one adjustment
// transaction, one audit row, the onboarding anchor left alone.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@db/db'
import { correctionsRepo } from './corrections.repo'
import { deriveBalance } from '@lib/balances'
import type { Account, Transaction } from '@db/types'

const ACC = '11111111-1111-4111-8111-111111111111'

const account = (over: Partial<Account> = {}): Account => ({
  id: ACC,
  name: 'BCA Tabungan',
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

async function balanceOf(): Promise<number> {
  const [acc, txns] = await Promise.all([
    db.accounts.get(ACC),
    db.transactions.toArray(),
  ])
  return deriveBalance(acc as Account, txns)
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.accounts.clear(),
    db.balanceCorrections.clear(),
  ])
  await db.accounts.put(account())
  // Derived balance starts at 690.000: one 700k pay-in, one 10k spend.
  await db.transactions.bulkPut([
    txn({ id: 't-in', date: '2026-07-01', amount: 700_000, direction: 'in' }),
    txn({ id: 't-out', date: '2026-07-02', amount: 10_000 }),
  ])
})

describe('correctionsRepo.correctBalance', () => {
  it('books the gap as a single adjustment transaction', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
      note: 'forgot what I spent on',
    })

    const adjustments = (await db.transactions.toArray()).filter((t) => t.is_adjustment)
    expect(adjustments).toHaveLength(1)
    expect(adjustments[0]).toMatchObject({
      amount: 278_000,
      direction: 'out',
      date: '2026-07-31',
      account_id: ACC,
      is_adjustment: true,
      is_transfer: false,
      category_id: null,
      recurring_item_id: null,
      note: 'forgot what I spent on',
    })
  })

  it('leaves the account holding exactly what the user said', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })
    expect(await balanceOf()).toBe(412_000)
  })

  it('books an incoming adjustment when the account holds more', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 900_000,
      asOfDate: '2026-07-31',
    })
    expect(await balanceOf()).toBe(900_000)
    const adj = (await db.transactions.toArray()).find((t) => t.is_adjustment)
    expect(adj).toMatchObject({ direction: 'in', amount: 210_000 })
  })

  it('appends an audit row pointing at the transaction it wrote', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
      note: 'cash I forgot to log',
    })

    const [row] = await db.balanceCorrections.toArray()
    const adj = (await db.transactions.toArray()).find((t) => t.is_adjustment)
    expect(row).toMatchObject({
      account_id: ACC,
      transaction_id: adj?.id,
      previous_balance: 690_000,
      new_balance: 412_000,
      as_of_date: '2026-07-31',
      note: 'cash I forgot to log',
    })
  })

  it('does not touch the onboarding opening-balance anchor', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })
    const acc = await db.accounts.get(ACC)
    expect(acc?.manual_balance_override).toBeNull()
    expect(acc?.last_balance_updated_at).toBeNull()
  })

  it('writes nothing when the balance already matches', async () => {
    const result = await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 690_000,
      asOfDate: '2026-07-31',
    })
    expect(result).toEqual({ ok: false, reason: 'no_change' })
    expect(await db.balanceCorrections.count()).toBe(0)
    expect(await db.transactions.count()).toBe(2)
  })

  it('refuses an as-of date inside the anchor window and writes nothing', async () => {
    await db.accounts.put(
      account({ manual_balance_override: 500_000, last_balance_updated_at: '2026-07-12' }),
    )
    const result = await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-12',
    })
    expect(result).toEqual({ ok: false, reason: 'before_anchor', anchorDate: '2026-07-12' })
    expect(await db.transactions.count()).toBe(2)
    expect(await db.balanceCorrections.count()).toBe(0)
  })

  it('replays later transactions on top of a backdated correction', async () => {
    await db.transactions.put(txn({ id: 't-later', date: '2026-07-25', amount: 24_000 }))
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-20',
    })
    // 412.000 stated as of the 20th, minus the 24.000 spent on the 25th.
    expect(await balanceOf()).toBe(388_000)
  })
})

describe('correctionsRepo.revert', () => {
  it('undoes the balance change and appends a reverting audit row', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })
    const [correction] = await db.balanceCorrections.toArray()
    if (!correction) throw new Error('no correction written')

    await correctionsRepo.revert(correction.id as string)

    expect(await balanceOf()).toBe(690_000)
    const rows = await db.balanceCorrections.orderBy('created_at').toArray()
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      account_id: ACC,
      previous_balance: 412_000,
      new_balance: 690_000,
      reverts_id: correction.id,
    })
  })

  it('never edits history in place', async () => {
    await correctionsRepo.correctBalance({
      accountId: ACC,
      actualBalance: 412_000,
      asOfDate: '2026-07-31',
    })
    const [original] = await db.balanceCorrections.toArray()
    if (!original) throw new Error('no correction written')
    await correctionsRepo.revert(original.id as string)
    const still = await db.balanceCorrections.get(original.id as string)
    expect(still).toMatchObject({ previous_balance: 690_000, new_balance: 412_000 })
  })
})
