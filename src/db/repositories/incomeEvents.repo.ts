import { recomputeDeltas } from '@engine/incomeSeries'
import { db } from '../db'
import type { IncomeEvent } from '../types'

const now = () => new Date().toISOString()

// Every read goes through this: watermark sync has no delete channel, so a
// deleted row is still on disk (and still pulled from the cloud) carrying
// deleted_at. Filtering here rather than at each call site is what keeps a
// tombstoned raise out of the FI projection, the monthly/yearly headers and
// the AI context. Same pattern as recurringItems.repo.
const live = () => db.incomeEvents.filter((e) => !e.deleted_at)

// delta_vs_prev is a fact about a *pair* of events, so any write can invalidate
// rows the user never touched — an edited date slides a row through the series
// and re-answers both its old neighbours and its new ones. Rather than work out
// which rows an edit dirtied, every write re-answers the whole series. A working
// life holds a handful of raises; the cost is nothing and the class of bug goes
// away. See engine/incomeSeries.ts.
//
// Only rows whose delta actually moved are written back, so an ordinary edit
// doesn't mark the entire history dirty for the next sync push.
async function resyncSeries(): Promise<void> {
  const events = await live().toArray()
  const byId = new Map(events.map((e) => [e.id, e.delta_vs_prev]))
  const changed = recomputeDeltas(events).filter(
    (e) => byId.get(e.id) !== e.delta_vs_prev,
  )
  if (changed.length > 0) await db.incomeEvents.bulkPut(changed)
}

export const incomeEventsRepo = {
  getAll: () => live().sortBy('date'),

  /** Newest non-deleted event — the "current salary" every projection reads. */
  getLatest: async () => (await live().sortBy('date')).at(-1),

  /** Newest-first, for the Income history list. */
  getAllDesc: async () => (await live().sortBy('date')).reverse(),

  create: async (data: Omit<IncomeEvent, 'id' | 'created_at'>) => {
    const id = await db.incomeEvents.add({ ...data, created_at: now() })
    await resyncSeries()
    return id
  },

  // Tombstone delete, not db.delete: a hard delete is re-inserted by the next
  // cloud pull. Mark it and let the normal push carry the tombstone.
  remove: async (id: string) => {
    await db.incomeEvents.update(id, { deleted_at: now() })
    await resyncSeries()
  },

  update: async (
    id: string,
    patch: Partial<Omit<IncomeEvent, 'id' | 'created_at'>>,
  ) => {
    const existing = await db.incomeEvents.get(id)
    await db.incomeEvents.update(id, {
      ...patch,
      // An onboarding-seeded figure the user has since corrected is theirs now.
      // Leaving it marked 'seed' invites setup to treat it as overwritable.
      ...(existing?.source === 'seed' ? { source: 'manual' as const } : {}),
    })
    await resyncSeries()
  },
}
