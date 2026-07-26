import 'fake-indexeddb/auto'
import { db } from '@db/db'
import { seedRecurringFromLogIfNeeded } from '@import/seedRecurringFromLog'
import { beforeEach, describe, expect, it } from 'vitest'

beforeEach(async () => {
  await Promise.all([
    db.recurringItems.clear(),
    db.appSettings.clear(),
  ])
})

describe('seedRecurringFromLogIfNeeded', () => {
  it('inserts the two known monthly transfers from the seed log', async () => {
    const { inserted, skipped } = await seedRecurringFromLogIfNeeded()

    expect(inserted).toBe(2)
    expect(skipped).toBe(0)

    const items = await db.recurringItems.toArray()
    expect(items).toHaveLength(2)

    const jessica = items.find((i) => i.name.includes('Jessica'))
    const jepriyanto = items.find((i) => i.name.includes('Jepriyanto'))

    expect(jessica).toMatchObject({
      amount: 20_000,
      cadence: 'monthly',
      kind: 'other',
      lane: 'protected_living',
      is_active: true,
    })
    expect(jepriyanto).toMatchObject({
      amount: 100_000,
      cadence: 'monthly',
      kind: 'other',
      lane: 'protected_living',
      is_active: true,
    })

    // last Jessica date in log is 2026-05-25 → next_due should be 2026-06-25
    expect(jessica?.next_due).toBe('2026-06-25')
    // last Jepriyanto date in log is 2026-05-25 → next_due should be 2026-06-25
    expect(jepriyanto?.next_due).toBe('2026-06-25')
  })

  it('is idempotent on second call (no duplicate rows)', async () => {
    await seedRecurringFromLogIfNeeded()
    const second = await seedRecurringFromLogIfNeeded()

    expect(second.inserted).toBe(0)
    expect(second.skipped).toBe(0)

    const items = await db.recurringItems.toArray()
    expect(items).toHaveLength(2)
  })
})
