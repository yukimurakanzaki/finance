import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@db/db'
import { seedTransactionsIfNeeded } from './seedTransactions'

describe('seedTransactionsIfNeeded', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.delete()
  })

  it('inserts seed transactions on first run', async () => {
    const result = await seedTransactionsIfNeeded()
    expect(result.inserted).toBeGreaterThan(0)

    const txns = await db.transactions.toArray()
    expect(txns.length).toBe(result.inserted)
  })

  it('is idempotent and skips duplicates on second run', async () => {
    const first = await seedTransactionsIfNeeded()
    const second = await seedTransactionsIfNeeded()

    expect(second.inserted).toBe(0)
    expect(second.skipped).toBe(0)

    const txns = await db.transactions.toArray()
    expect(txns.length).toBe(first.inserted)
  })

  it('flags transfer pairs', async () => {
    const result = await seedTransactionsIfNeeded()
    expect(result.transferPairs).toBeGreaterThanOrEqual(0)

    const transfers = await db.transactions
      .filter((t) => t.is_transfer)
      .toArray()

    // Each pair has two transactions sharing the same pair id
    const pairIds = new Set(transfers.map((t) => t.transfer_pair_id))
    expect(transfers.length).toBe(pairIds.size * 2)
  })
})
