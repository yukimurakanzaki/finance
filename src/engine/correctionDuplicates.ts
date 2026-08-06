// D1 edge case 7 — detecting the one failure mode the transaction model can't
// resolve on its own.
//
// Correcting a balance is an insert, not an overwrite. That is what keeps the
// money traceable, but it also means two devices correcting the same account
// while offline do not race — they *both win*. Each books its own adjustment
// against the same stale balance, and once both sync the account is wrong by
// the whole duplicate amount, silently and permanently.
//
// A last-write-wins field would have collapsed those into one. This has to be
// noticed and handed to a human instead, because the app cannot know which of
// the two the user meant. Deliberately never auto-merges.
import type { BalanceCorrection } from '@db/types'

export interface DuplicateGroup {
  account_id: string
  as_of_date: string
  /** The colliding corrections, oldest first. */
  ids: string[]
  /** The balance every one of them started from. */
  previous_balance: number
}

/**
 * Corrections that collide: same account, same as-of date, and — the part that
 * matters — the same starting balance.
 *
 * That last condition is what separates a duplicate from a legitimate second
 * correction. A device that corrected again after seeing the first starts from
 * the first one's *result*; a device that never saw it starts from the same
 * stale figure. Comparing starting points asks "did these two know about each
 * other?", which is exactly the question.
 *
 * Corrections whose amounts differ still collide — two devices that disagreed
 * both applied, so both are wrong. Reverting rows are skipped, and a group
 * whose members have already been undone is no longer a problem to report.
 */
export function findDuplicateCorrections(
  corrections: BalanceCorrection[],
): DuplicateGroup[] {
  const reverted = new Set(
    corrections.map((c) => c.reverts_id).filter((id): id is string => Boolean(id)),
  )

  const live = corrections.filter((c) => !c.reverts_id && c.id && !reverted.has(c.id))

  const groups = new Map<string, BalanceCorrection[]>()
  for (const c of live) {
    const key = `${c.account_id}|${c.as_of_date}|${c.previous_balance}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(c)
    else groups.set(key, [c])
  }

  const out: DuplicateGroup[] = []
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue
    const sorted = [...bucket].sort((a, b) => a.created_at.localeCompare(b.created_at))
    out.push({
      account_id: sorted[0]?.account_id as string,
      as_of_date: sorted[0]?.as_of_date as string,
      previous_balance: sorted[0]?.previous_balance as number,
      ids: sorted.map((c) => c.id as string),
    })
  }
  return out
}
