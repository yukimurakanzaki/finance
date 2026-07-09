import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import type { Transaction, Lane } from '@db/types'
import seedData from '../../data/transactions-jan-jun-2026.json'

const SEED_FLAG_KEY = 'seeded:transactions-jan-jun-2026'
const BATCH_SIZE = 100

interface SeedRow {
  date: string
  amount: number
  direction: 'in' | 'out'
  account_id: string
  category?: string
  suggested_lane: Lane
  note?: string
}

export async function seedTransactionsIfNeeded(): Promise<{
  inserted: number
  skipped: number
  transferPairs: number
}> {
  const alreadySeeded = await settingsRepo.get(SEED_FLAG_KEY)
  if (alreadySeeded === 'true') {
    return { inserted: 0, skipped: 0, transferPairs: 0 }
  }

  const rows = seedData as SeedRow[]
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, skipped: 0, transferPairs: 0 }
  }

  const existing = await db.transactions.toArray()
  const existingKeys = new Set(
    existing.map((t) => `${t.date}|${t.account_id}|${t.amount}|${t.direction}`),
  )

  const now = new Date().toISOString()
  const toInsert: Omit<Transaction, 'id'>[] = []

  for (const row of rows) {
    const key = `${row.date}|${row.account_id}|${row.amount}|${row.direction}`
    if (existingKeys.has(key)) continue

    toInsert.push({
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      account_id: row.account_id,
      category_id: null,
      lane: row.suggested_lane,
      source: 'csv_import',
      title: null,
      note: row.note || null,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: false,
      transfer_pair_id: null,
      created_at: now,
    })
  }

  const skipped = rows.length - toInsert.length

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    await db.transactions.bulkAdd(batch)
  }

  const transferPairs = await detectAndFlagTransfers()

  await settingsRepo.set(SEED_FLAG_KEY, 'true')

  return { inserted: toInsert.length, skipped, transferPairs }
}

async function detectAndFlagTransfers(): Promise<number> {
  const txns = await db.transactions.toArray()
  const ownAccountIds = [...new Set(txns.map((t) => t.account_id))]

  const outs = txns.filter(
    (t) => t.direction === 'out' && ownAccountIds.includes(t.account_id) && !t.is_transfer,
  )
  const ins = txns
    .filter(
      (t) => t.direction === 'in' && ownAccountIds.includes(t.account_id) && !t.is_transfer,
    )
    .sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date))

  const usedIn = new Set<string>()
  let count = 0

  for (const out of outs) {
    const match = findMatch(ins, out, usedIn)
    if (match && out.id && match.id) {
      const pairId = crypto.randomUUID()
      await db.transactions.update(out.id, { is_transfer: true, transfer_pair_id: pairId })
      await db.transactions.update(match.id, { is_transfer: true, transfer_pair_id: pairId })
      usedIn.add(match.id)
      count++
    }
  }

  return count
}

function findMatch(
  sortedIns: Transaction[],
  out: Transaction,
  usedIn: Set<string>,
): Transaction | null {
  let lo = 0
  let hi = sortedIns.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sortedIns[mid]!.amount < out.amount) lo = mid + 1
    else hi = mid
  }

  for (let i = lo; i < sortedIns.length; i++) {
    const row = sortedIns[i]
    if (!row) continue
    if (row.amount !== out.amount) break
    if (usedIn.has(row.id!)) continue
    if (row.account_id === out.account_id) continue
    if (
      Math.abs(new Date(row.date).getTime() - new Date(out.date).getTime()) / 86_400_000 >
      1
    ) {
      continue
    }
    return row
  }

  return null
}
