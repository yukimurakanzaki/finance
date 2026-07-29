import { db } from '../db'
import type { IncomeEvent } from '../types'

const now = () => new Date().toISOString()

// Every read goes through this: watermark sync has no delete channel, so a
// deleted row is still on disk (and still pulled from the cloud) carrying
// deleted_at. Filtering here rather than at each call site is what keeps a
// tombstoned raise out of the FI projection, the monthly/yearly headers and
// the AI context. Same pattern as recurringItems.repo.
const live = () => db.incomeEvents.filter((e) => !e.deleted_at)

export const incomeEventsRepo = {
  getAll: () => live().sortBy('date'),

  /** Newest non-deleted event — the "current salary" every projection reads. */
  getLatest: async () => (await live().sortBy('date')).at(-1),

  /** Newest-first, for the Income history list. */
  getAllDesc: async () => (await live().sortBy('date')).reverse(),

  create: (data: Omit<IncomeEvent, 'id' | 'created_at'>) =>
    db.incomeEvents.add({ ...data, created_at: now() }),

  // Tombstone delete, not db.delete: a hard delete is re-inserted by the next
  // cloud pull. Mark it and let the normal push carry the tombstone.
  remove: (id: string) => db.incomeEvents.update(id, { deleted_at: now() }),

  update: (
    id: string,
    patch: Partial<Omit<IncomeEvent, 'id' | 'created_at'>>,
  ) => db.incomeEvents.update(id, patch),
}
