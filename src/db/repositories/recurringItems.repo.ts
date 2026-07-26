import { db } from '../db'
import type { RecurringItem, RecurringKind } from '../types'

const now = () => new Date().toISOString()

export const recurringRepo = {
  getActive: () => db.recurringItems.filter((r) => r.is_active).toArray(),

  getByKind: (kind: RecurringKind) =>
    db.recurringItems.where('kind').equals(kind).filter((r) => r.is_active).toArray(),

  create: (data: Omit<RecurringItem, 'id' | 'created_at'>) =>
    db.recurringItems.add({ ...data, created_at: now() }),

  update: (id: string, patch: Partial<RecurringItem>) =>
    db.recurringItems.update(id, patch),

  deactivate: (id: string) =>
    db.recurringItems.update(id, { is_active: false }),

  // Tombstone delete: watermark sync has no delete channel, so mark the row
  // deleted and let the normal push carry it. is_active:false reuses every
  // existing is_active filter; only the Register's paused list needs !deleted_at.
  remove: (id: string) =>
    db.recurringItems.update(id, { deleted_at: now(), is_active: false }),

  advanceDue: (id: string, nextDue: string) =>
    db.recurringItems.update(id, { next_due: nextDue }),
}
