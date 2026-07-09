import { db } from '../db'
import type { Transaction, NetWorthSnapshot, Lane, AssetType } from '../types'
import type { ValidImportRow } from '../../import/schema'
import { advanceByOneMonth } from '@lib/dates'

const now = () => new Date().toISOString()

export const transactionsRepo = {
  getByWeek: (weekStart: string, weekEnd: string, excludeTransfers = true) =>
    db.transactions
      .where('date')
      .between(weekStart, weekEnd, true, true)
      .filter((t) => !excludeTransfers || !t.is_transfer)
      .toArray(),

  getByMonth: (yearMonth: string, excludeTransfers = true) =>
    db.transactions
      .where('date')
      .startsWith(yearMonth)
      .filter((t) => !excludeTransfers || !t.is_transfer)
      .toArray(),

  getDuplicateCandidate: (
    date: string,
    amount: number,
    direction: 'in' | 'out',
    account_id: string,
  ) =>
    db.transactions
      .where('[date+account_id]')
      .equals([date, account_id])
      .filter((t) => t.amount === amount && t.direction === direction)
      .first(),

  add: (data: Omit<Transaction, 'id' | 'created_at'>) =>
    db.transactions.add({ ...data, created_at: now() }),

  override: async (id: string, overrideAmount: number, note: string | null) =>
    db.transaction('rw', db.transactions, async () => {
      const existing = await db.transactions.get(id)
      if (!existing) throw new Error(`Transaction ${id} not found`)
      await db.transactions.update(id, {
        original_amount: existing.amount,
        overridden_amount: overrideAmount,
        override_note: note,
        overridden_at: now(),
        amount: overrideAmount,
      })
    }),

  unflagTransfer: (id: string) =>
    db.transactions.update(id, { is_transfer: false, transfer_pair_id: null }),

  flagTransfer: (idA: string, idB: string) => {
    const pairId = crypto.randomUUID()
    return db.transaction('rw', db.transactions, async () => {
      await db.transactions.update(idA, { is_transfer: true, transfer_pair_id: pairId })
      await db.transactions.update(idB, { is_transfer: true, transfer_pair_id: pairId })
    })
  },

  importBatch: async (
    rows: ValidImportRow[],
    yearMonth: string,
    currentLaneTotals: Record<Lane, number>,
    netWorthTotal: number,
  ): Promise<{ imported_count: number; snapshot_year_month: string }> => {
    return db.transaction(
      'rw',
      db.transactions,
      db.netWorthSnapshots,
      db.recurringItems,
      async () => {
        // 1. Write transactions
        const txnRecords: Omit<Transaction, 'id'>[] = rows.map((row) => ({
          date: row.date,
          amount: row.amount,
          direction: row.direction,
          account_id: row._resolved_account.id!,
          category_id: row._resolved_category?.id ?? null,
          lane: row.suggested_lane,
          source: 'claude_import' as const,
          title: null,
          note: row.note || null,
          original_amount: null,
          overridden_amount: null,
          override_note: null,
          overridden_at: null,
          is_transfer: row.is_transfer ?? false,
          transfer_pair_id: row.transfer_pair_id ?? null,
          created_at: now(),
        }))
        await db.transactions.bulkAdd(txnRecords)

        // 2. Upsert net worth snapshot
        const existing = await db.netWorthSnapshots
          .where('year_month')
          .equals(yearMonth)
          .first()
        const snapshot: Omit<NetWorthSnapshot, 'id'> = {
          year_month: yearMonth,
          total: netWorthTotal,
          by_lane: currentLaneTotals,
          taken_at: now(),
        }
        if (existing?.id) {
          await db.netWorthSnapshots.update(existing.id, snapshot)
        } else {
          await db.netWorthSnapshots.add(snapshot)
        }

        // 3. Advance next_due on recurring items whose name appears in batch notes
        await advanceNextDueFromBatch(rows)

        return { imported_count: rows.length, snapshot_year_month: yearMonth }
      },
    )
  },
}

async function advanceNextDueFromBatch(rows: ValidImportRow[]) {
  const activeRecurring = await db.recurringItems.filter((r) => r.is_active).toArray()
  for (const item of activeRecurring) {
    const matched = rows.some(
      (row) =>
        row.direction === 'out' &&
        row.note?.toLowerCase().includes(item.name.toLowerCase()),
    )
    if (matched && item.cadence === 'monthly') {
      await db.recurringItems.update(item.id!, {
        next_due: advanceByOneMonth(item.next_due),
      })
    }
  }
}
