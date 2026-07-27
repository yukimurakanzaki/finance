import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { incomeEventsRepo } from './incomeEvents.repo'
import type { IncomeEvent } from '../types'

beforeEach(async () => {
  await db.incomeEvents.clear()
})

const income = (over: Partial<IncomeEvent> = {}): IncomeEvent => ({
  id: 'inc-1',
  date: '2026-07-01',
  gross: 30_000_000,
  take_home_net: 25_000_000,
  delta_vs_prev: null,
  routed_to_pipe: 0,
  routed_to_lifestyle: 0,
  note: null,
  source: 'manual',
  created_at: '2026-07-01T00:00:00.000Z',
  ...over,
})

describe('remove (tombstone)', () => {
  it('keeps the row but stamps deleted_at', async () => {
    await db.incomeEvents.put(income())

    await incomeEventsRepo.remove('inc-1')

    // Row survives so the watermark sync can push the delete to other devices;
    // a hard delete would just be re-inserted by the next pull.
    const row = await db.incomeEvents.get('inc-1')
    expect(row).toBeDefined()
    expect(row?.deleted_at).toBeTruthy()
  })

  it('hides the tombstoned row from every read', async () => {
    await db.incomeEvents.put(income())
    await db.incomeEvents.put(
      income({ id: 'inc-2', date: '2026-08-01', take_home_net: 28_000_000 }),
    )

    await incomeEventsRepo.remove('inc-2')

    expect(await incomeEventsRepo.getAll()).toHaveLength(1)
    expect(await incomeEventsRepo.getAllDesc()).toHaveLength(1)
    // The projection reads getLatest — it must fall back to the older raise,
    // not keep quoting the deleted one.
    expect((await incomeEventsRepo.getLatest())?.id).toBe('inc-1')
  })

  it('getLatest returns the newest by date, not insertion order', async () => {
    await db.incomeEvents.put(income({ id: 'inc-a', date: '2026-08-01' }))
    await db.incomeEvents.put(income({ id: 'inc-b', date: '2026-06-01' }))

    expect((await incomeEventsRepo.getLatest())?.id).toBe('inc-a')
  })
})
