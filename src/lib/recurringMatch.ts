import type { RecurringItem } from '@db/types'

// Shared "does this look like it pays a committed recurring item" logic, used
// by both transaction-creation paths that don't have a human explicitly
// picking from the manual form's "Pays a recurring item" dropdown (see
// TransactionForm.tsx): the AI chat's log_transactions tool and the statement
// reconcile/import pipeline. A row tagged with the resulting recurring_item_id
// is excluded from the personal safe-to-spend draw (see engine/safeToSpend.ts
// isWeekDraw) — so this only ever matches against ACTIVE items, and only ever
// returns an id that is real, to avoid silently hiding real discretionary
// spend behind a wrong or stale recurring link.
//
// Simple case-insensitive substring match, deliberately — no fuzzy matching,
// no ML. See BACKLOG.md C1.

/**
 * Find the first active recurring item whose name is a case-insensitive
 * substring of the given text (typically a transaction note/description).
 * Returns null if the text is empty/absent or nothing matches.
 */
export function matchRecurringItemByText(
  text: string | null | undefined,
  activeRecurring: RecurringItem[],
): RecurringItem | null {
  const needle = text?.trim().toLowerCase()
  if (!needle) return null
  return (
    activeRecurring.find((item) => {
      const name = item.name.trim().toLowerCase()
      return name.length > 0 && needle.includes(name)
    }) ?? null
  )
}

/**
 * Validate a candidate recurring_item_id (e.g. one an LLM claims to have
 * picked, or one a UI passes through) against the real list of active
 * recurring items. Returns the id only if it belongs to an active item in
 * that list — an unknown, inactive, or empty id always resolves to null.
 * Never trust a caller-supplied id without this check: a wrongly-accepted id
 * would wrongly exclude real spend from the safe-to-spend pool.
 */
export function resolveRecurringItemId(
  candidateId: string | null | undefined,
  activeRecurring: RecurringItem[],
): string | null {
  if (!candidateId) return null
  return activeRecurring.some((item) => item.id === candidateId)
    ? candidateId
    : null
}
