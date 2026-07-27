import { db } from '../db'
import type { IncomeEvent } from '../types'

const now = () => new Date().toISOString()

export const incomeEventsRepo = {
  getAll: () => db.incomeEvents.orderBy('date').toArray(),

  getLatest: () => db.incomeEvents.orderBy('date').last(),

  create: (data: Omit<IncomeEvent, 'id' | 'created_at'>) =>
    db.incomeEvents.add({ ...data, created_at: now() }),

  remove: (id: number) => db.incomeEvents.delete(id),

  update: (
    id: number,
    patch: Partial<Omit<IncomeEvent, 'id' | 'created_at'>>,
  ) => db.incomeEvents.update(id, patch),
}
