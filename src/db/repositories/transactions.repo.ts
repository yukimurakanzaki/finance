import { advanceByOneMonth } from '@lib/dates'
import {
  matchRecurringItemByText,
  resolveRecurringItemId,
} from '@lib/recurringMatch'
import type { ValidImportRow } from '../../import/schema'
import { db } from '../db'
import { deletionsRepo } from './deletions.repo'
import type {
  AssetType,
  Lane,
  NetWorthSnapshot,
  RecurringItem,
  Transaction,
} from '../types'

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

  addTransfer: (data: {
    date: string
    amount: number
    from_account_id: string
    from_lane: Lane
    to_account_id: string
    to_lane: Lane
    note: string | null
  }) => {
    const pairId = crypto.randomUUID()
    const base = {
      date: data.date,
      amount: data.amount,
      category_id: null,
      source: 'manual' as const,
      title: null,
      note: data.note,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: true,
      transfer_pair_id: pairId,
      recurring_item_id: null,
      created_at: now(),
    }
    return db.transaction('rw', db.transactions, async () => {
      await db.transactions.add({
        ...base,
        direction: 'out',
        account_id: data.from_account_id,
        lane: data.from_lane,
      })
      await db.transactions.add({
        ...base,
        direction: 'in',
        account_id: data.to_account_id,
        lane: data.to_lane,
      })
    })
  },

  // Routed through deletionsRepo so the delete carries a tombstone: without
  // one it never reaches the other devices, and comes back here on the next
  // full hydrate.
  deleteWithPair: async (id: string) => {
    const t = await db.transactions.get(id)
    if (!t) return
    if (t.transfer_pair_id) {
      const legs = await db.transactions
        .where('transfer_pair_id')
        .equals(t.transfer_pair_id)
        .toArray()
      await deletionsRepo.removeMany(
        'transactions',
        legs.map((l) => l.id as string),
      )
    } else {
      await deletionsRepo.remove('transactions', id)
    }
  },

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
      await db.transactions.update(idA, {
        is_transfer: true,
        transfer_pair_id: pairId,
      })
      await db.transactions.update(idB, {
        is_transfer: true,
        transfer_pair_id: pairId,
      })
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
        const activeRecurring = await db.recurringItems
          .filter((r) => r.is_active)
          .toArray()

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
          // The reconcile confirm screen resolves (and lets the user dismiss)
          // a suggested recurring-item link per row before calling this, and
          // passes its decision through explicitly — including an explicit
          // null when the user dismissed the suggestion. Only fall back to
          // this repo's own auto-match when the field is entirely absent
          // (e.g. a caller that bypasses the confirm screen, as the
          // integration tests do).
          recurring_item_id:
            row.recurring_item_id !== undefined
              ? resolveRecurringItemId(row.recurring_item_id, activeRecurring)
              : (matchRecurringItem(row, activeRecurring)?.id ?? null),
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
  const activeRecurring = await db.recurringItems
    .filter((r) => r.is_active)
    .toArray()
  for (const item of activeRecurring) {
    const matched = rows.some((row) => matchRecurringItem(row, [item]))
    if (matched && item.cadence === 'monthly') {
      await db.recurringItems.update(item.id!, {
        next_due: advanceByOneMonth(item.next_due),
      })
    }
  }
}

export function matchRecurringItem(
  row: { direction: 'in' | 'out'; note?: string | null },
  activeRecurring: RecurringItem[],
): RecurringItem | null {
  if (row.direction !== 'out') return null
  return matchRecurringItemByText(row.note, activeRecurring)
}
