import { db } from '../db'
import type { Account } from '../types'
import { todayISO } from '@lib/dates'

const now = () => new Date().toISOString()

export const accountsRepo = {
  getAll: () => db.accounts.toArray(),

  getActive: () => db.accounts.filter((a) => a.is_active).toArray(),

  getById: (id: number) => db.accounts.get(id),

  create: (data: Omit<Account, 'id' | 'created_at'>) =>
    db.accounts.add({ ...data, created_at: now() }),

  update: (id: number, patch: Partial<Account>) => db.accounts.update(id, patch),

  deactivate: (id: number) => db.accounts.update(id, { is_active: false }),

  updateManualBalance: (id: number, balance: number) =>
    db.accounts.update(id, {
      manual_balance_override: balance,
      last_balance_updated_at: todayISO(),
    }),
}
