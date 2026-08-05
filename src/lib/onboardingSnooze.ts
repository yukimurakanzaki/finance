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
  await allowanceRepo.upsert({
    monthly_amount: 0,
    weekend_allocation: 0,
    onboarding_snoozed_until: endOfDay.toISOString(),
  })
}
