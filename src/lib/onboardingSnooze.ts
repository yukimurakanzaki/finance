import { allowanceRepo } from '@db/repositories/allowance.repo'

/**
 * Snooze the onboarding nag until end of today (local timezone).
 * After this call, buildSystemPrompt omits the ONBOARDING STATE block for
 * the rest of the day (FR-1.2 / NFR-X4). Suppression happens in context
 * assembly, never by instructing the model.
 */
export async function snoozeOnboarding(): Promise<void> {
  const now = new Date()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  // Carry the existing amounts through: set() replaces the whole row, so
  // snoozing must never zero an allowance the user already declared.
  const prev = await allowanceRepo.get()
  await allowanceRepo.set({
    monthly_amount: prev?.monthly_amount ?? 0,
    weekend_allocation: prev?.weekend_allocation ?? 0,
    onboarding_snoozed_until: endOfDay.toISOString(),
  })
}
