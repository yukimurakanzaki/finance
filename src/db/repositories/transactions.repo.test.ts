import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { transactionsRepo } from './transactions.repo'

beforeEach(async () => {
  await db.transactions.clear()
})

describe('addTransfer', () => {
  it('writes two paired legs that net to zero', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-09', amount: 200_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })
    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(2)
    const [a, b] = rows
    expect(a!.transfer_pair_id).toBe(b!.transfer_pair_id)
    expect(rows.every((r) => r.is_transfer)).toBe(true)
    expect(rows.find((r) => r.direction === 'out')?.account_id).toBe('acc-bca')
    expect(rows.find((r) => r.direction === 'in')?.account_id).toBe('acc-gopay')
  })
})

describe('deleteWithPair', () => {
  it('deletes both legs of a transfer', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-09', amount: 50_000,
      from_account_id: 'a', from_lane: 'protected_living',
      to_account_id: 'b', to_lane: 'protected_living',
      note: null,
    })
    const leg = await db.transactions.toCollection().first()
    await transactionsRepo.deleteWithPair(leg?.id as string)
    expect(await db.transactions.count()).toBe(0)
  })

  it('deletes a plain transaction alone', async () => {
    const id = await transactionsRepo.add({
      date: '2026-07-09', amount: 10_000, direction: 'out', account_id: 'a',
      category_id: null, lane: 'protected_living', source: 'manual',
      title: 'Kopi', note: null, original_amount: null, overridden_amount: null,
      override_note: null, overridden_at: null, is_transfer: false, transfer_pair_id: null,
    })
    await transactionsRepo.deleteWithPair(id)
    expect(await db.transactions.count()).toBe(0)
  })
})
