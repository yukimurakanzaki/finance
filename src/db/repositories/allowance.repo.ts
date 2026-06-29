import { db } from '../db'
import type { Allowance } from '../types'

const now = () => new Date().toISOString()

export const allowanceRepo = {
  get: () => db.allowance.get(1),

  set: (data: Omit<Allowance, 'id' | 'updated_at'>) =>
    db.allowance.put({ id: 1, ...data, updated_at: now() }),
}
