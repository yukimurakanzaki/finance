import { db } from '../db'
import type { Account } from '../types'
import { todayISO } from '@lib/dates'

const now = () => new Date().toISOString()

export const accountsRepo = {
  getAll: () => db.accounts.toArray(),

  getActive: () => db.accounts.filter((a) => a.is_active).toArray(),

  getById: (id: string) => db.accounts.get(id),

  create: (data: Omit<Account, 'id' | 'created_at'>) =>
    db.accounts.add({ ...data, created_at: now() }),

  update: (id: string, patch: Partial<Account>) => db.accounts.update(id, patch),

  deactivate: (id: string) => db.accounts.update(id, { is_active: false }),

  updateManualBalance: (id: string, balance: number) =>
    db.accounts.update(id, {
      manual_balance_override: balance,
      last_balance_updated_at: todayISO(),
    }),
}
