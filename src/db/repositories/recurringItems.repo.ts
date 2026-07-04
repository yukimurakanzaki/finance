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

  advanceDue: (id: string, nextDue: string) =>
    db.recurringItems.update(id, { next_due: nextDue }),
}
