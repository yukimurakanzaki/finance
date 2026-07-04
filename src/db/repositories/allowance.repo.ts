import { db } from '../db'
import type { Allowance } from '../types'

const now = () => new Date().toISOString()

// Single local row; the sync layer maps it to the (household_id, member_id) cloud row.
const LOCAL_ID = 'local'

export const allowanceRepo = {
  get: () => db.allowance.get(LOCAL_ID),

  set: (data: Omit<Allowance, 'id' | 'updated_at'>) =>
    db.allowance.put({ id: LOCAL_ID, ...data, updated_at: now() }),
}
