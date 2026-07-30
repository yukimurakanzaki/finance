import { db } from '@db/db'
import { recurringRepo } from '@db/repositories/recurringItems.repo'
import { settingsRepo } from '@db/repositories/settings.repo'
import type { Lane, RecurringItem } from '@db/types'
import seedData from '../../data/transactions-jan-jun-2026.json'

// One-time seed: read the historical transaction log and register the recurring
// bills that have a stable monthly cadence. Guards with `seeded:recurring-from-log`
// so it is safe to call on every boot.
//
// The log has very few true monthly bills — most "recurring" notes are
// transfers, sinking-fund allocations, or daily-spending noise. The candidates
// below are the ones we can confidently commit. Add more here as bills appear
// in future imports.

const SEED_FLAG_KEY = 'seeded:recurring-from-log'

interface Candidate {
  name: string
  matchNote: string
  matchAmount: number
  kind: RecurringItem['kind']
  lane: Lane
  isProtected: boolean
  note: string
}

const CANDIDATES: Candidate[] = [
  {
    name: 'Transfer Bulanan - Jessica Susanto',
    matchNote: 'Personal Transfer - Jessica Susanto - Review purpose',
    matchAmount: 20_000,
    kind: 'other',
    lane: 'protected_living',
    isProtected: false,
    note: 'Auto-seeded from monthly transaction log (4/5 months at IDR 20k)',
  },
  {
    name: 'Transfer Bulanan - Jepriyanto',
    matchNote: 'Personal Transfer - Jepriyanto - Review purpose',
    matchAmount: 100_000,
    kind: 'other',
    lane: 'protected_living',
    isProtected: false,
    note: 'Auto-seeded from monthly transaction log (4/5 months at IDR 100k)',
  },
]

interface SeedRow {
  date: string
  amount: number
  direction: 'in' | 'out'
  note?: string
}

function nextDueFor(rows: SeedRow[], c: Candidate): string {
  // Most recent occurrence in the log + 1 calendar month, or the existing
  // next_due if a row for this candidate is already registered.
  const hits = (seedData as SeedRow[])
    .filter(
      (r) =>
        r.direction === 'out' &&
        r.note?.trim() === c.matchNote &&
        r.amount === c.matchAmount,
    )
    .map((r) => r.date)
    .sort()
  const last = hits.at(-1)
  if (!last) return new Date().toISOString().slice(0, 10)
  const d = new Date(`${last}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export async function seedRecurringFromLogIfNeeded(): Promise<{
  inserted: number
  skipped: number
}> {
  const seeded = (await settingsRepo.get(SEED_FLAG_KEY)) === 'true'
  const existing = await db.recurringItems.toArray()
  const existingKeys = new Set(
    existing.map((r) => `${r.name}|${r.amount}|${r.cadence}`),
  )
  if (
    seeded &&
    CANDIDATES.every((c) => existingKeys.has(`${c.name}|${c.matchAmount}|monthly`))
  ) {
    return { inserted: 0, skipped: 0 }
  }

  const now = new Date().toISOString()
  let inserted = 0
  let skipped = 0

  for (const c of CANDIDATES) {
    const key = `${c.name}|${c.matchAmount}|monthly`
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    const payload: Omit<RecurringItem, 'id'> = {
      name: c.name,
      amount: c.matchAmount,
      cadence: 'monthly',
      kind: c.kind,
      lane: c.lane,
      is_protected: c.isProtected,
      is_active: true,
      next_due: nextDueFor(seedData as SeedRow[], c),
      end_date: null,
      note: c.note,
      created_at: now,
    }
    await recurringRepo.create(payload)
    inserted++
  }

  if (!seeded || inserted > 0) {
    await settingsRepo.set(SEED_FLAG_KEY, 'true')
  }
  return { inserted, skipped }
}
