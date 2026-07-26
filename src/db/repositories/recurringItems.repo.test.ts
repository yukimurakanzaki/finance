import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { recurringRepo } from './recurringItems.repo'
import type { RecurringItem } from '../types'

beforeEach(async () => {
  await db.recurringItems.clear()
})

const recurring = (over: Partial<RecurringItem> = {}): RecurringItem => ({
  id: 'rec-1',
  name: 'Claude Pro',
  amount: 380_000,
  cadence: 'monthly',
  kind: 'personal_sub',
  lane: 'protected_living',
  is_protected: false,
  is_active: true,
  next_due: '2026-07-01',
  end_date: null,
  note: null,
  created_at: '2026-07-01T00:00:00.000Z',
  ...over,
})

describe('remove (tombstone)', () => {
  it('keeps the row but stamps deleted_at and deactivates it', async () => {
    await db.recurringItems.put(recurring())

    await recurringRepo.remove('rec-1')

    const row = await db.recurringItems.get('rec-1')
    // Row survives so the watermark sync can push the delete to other devices.
    expect(row).toBeDefined()
    expect(row?.deleted_at).toBeTruthy()
    expect(row?.is_active).toBe(false)
  })

  it('deletes even when the item has payment history (no guard)', async () => {
    await db.recurringItems.put(recurring())
    await db.transactions.put({ id: 'txn-1', recurring_item_id: 'rec-1' } as never)

    await recurringRepo.remove('rec-1')

    expect((await db.recurringItems.get('rec-1'))?.deleted_at).toBeTruthy()
  })
})
