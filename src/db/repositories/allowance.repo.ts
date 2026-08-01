import { db } from '../db'
import type { Allowance } from '../types'

const now = () => new Date().toISOString()

// Single local row; the sync layer maps it to the (household_id, member_id) cloud row.
const LOCAL_ID = 'local'

export const allowanceRepo = {
  get: () => db.allowance.get(LOCAL_ID),

  // put() replaces the whole row, so onboarding_snoozed_until is carried over
  // when the caller does not mention it — otherwise editing the allowance
  // amount would silently clear an active snooze. Passing it explicitly still
  // works: a value snoozes, null un-snoozes.
  set: async (
    data: Omit<Allowance, 'id' | 'updated_at' | 'onboarding_snoozed_until'> &
      Partial<Pick<Allowance, 'onboarding_snoozed_until'>>,
  ) => {
    const prev = await db.allowance.get(LOCAL_ID)
    return db.allowance.put({
      id: LOCAL_ID,
      ...data,
      onboarding_snoozed_until:
        'onboarding_snoozed_until' in data
          ? (data.onboarding_snoozed_until ?? null)
          : (prev?.onboarding_snoozed_until ?? null),
      updated_at: now(),
    })
  },
}
