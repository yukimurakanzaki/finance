import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Asset,
  Transaction,
  Category,
  Envelope,
  RecurringItem,
  Allowance,
  NetWorthSnapshot,
  IncomeEvent,
  Milestone,
  Assumptions,
  AppSetting,
  ChatMessage,
} from './types'

// Local sync bookkeeping (never pushed to the cloud).
export interface SyncMeta {
  key: string // e.g. "pushed:transactions" | "pulled:transactions"
  value: string // ISO timestamp watermark
}

// Tables that sync to the cloud (id-keyed). Order respects FK dependencies for
// hydrate/push (parents before children). chatMessages stays local-only.
export const SYNC_TABLES = [
  'accounts',
  'envelopes',
  'categories',
  'assets',
  'recurringItems',
  'incomeEvents',
  'transactions',
  'milestones',
  'netWorthSnapshots',
  'allowance',
  'assumptions',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

class FIDatabase extends Dexie {
  accounts!: Table<Account, string>
  assets!: Table<Asset, string>
  transactions!: Table<Transaction, string>
  categories!: Table<Category, string>
  envelopes!: Table<Envelope, string>
  recurringItems!: Table<RecurringItem, string>
  allowance!: Table<Allowance, string>
  netWorthSnapshots!: Table<NetWorthSnapshot, string>
  incomeEvents!: Table<IncomeEvent, string>
  milestones!: Table<Milestone, string>
  assumptions!: Table<Assumptions, string>
  appSettings!: Table<AppSetting, string>
  chatMessages!: Table<ChatMessage, number>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('fi-dashboard')

    // v1: Phase 1 skeleton (legacy numeric auto-increment).
    this.version(1).stores({
      accounts: '++id, account_type, lane, is_active',
      assets: '++id, lane, asset_type, last_valued_at',
      transactions:
        '++id, date, account_id, lane, direction, is_transfer, [date+account_id]',
      categories: '++id, lane, envelope_id',
      envelopes: '++id, horizon, period, parent_envelope_id',
      recurringItems: '++id, kind, lane, is_active, next_due',
      allowance: '++id',
      netWorthSnapshots: '++id, &year_month',
      incomeEvents: '++id, date',
      milestones: '++id, flag_date, status',
      assumptions: '++id',
      appSettings: '&key',
    })

    // v2: transfer + override fields on transactions, is_active/end_date on recurringItems
    this.version(2)
      .stores({
        transactions:
          '++id, date, account_id, lane, direction, is_transfer, transfer_pair_id, [date+account_id], [date+account_id+direction]',
      })
      .upgrade((tx) =>
        Promise.all([
          tx
            .table<RecurringItem>('recurringItems')
            .toCollection()
            .modify((item) => {
              if (item.is_active === undefined) item.is_active = true
              if (item.end_date === undefined) item.end_date = null
              if (item.note === undefined) item.note = null
            }),
          tx
            .table<Transaction>('transactions')
            .toCollection()
            .modify((t) => {
              if (t.original_amount === undefined) t.original_amount = null
              if (t.overridden_amount === undefined) t.overridden_amount = null
              if (t.override_note === undefined) t.override_note = null
              if (t.overridden_at === undefined) t.overridden_at = null
              if (t.is_transfer === undefined) t.is_transfer = false
              if (t.transfer_pair_id === undefined) t.transfer_pair_id = null
            }),
        ]),
      )

    // v4: milestone gains income_event_id FK
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<Milestone>('milestones')
          .toCollection()
          .modify((m) => {
            if (m.income_event_id === undefined) m.income_event_id = null
          }),
      )

    // v5: AI finance manager chat history (local-only, stays numeric autoincrement)
    this.version(5).stores({
      chatMessages: '++id, created_at',
    })

    // v6: auto market pricing fields on assets
    this.version(6)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<Asset>('assets')
          .toCollection()
          .modify((a) => {
            if (a.auto_price === undefined) a.auto_price = null
            if (a.fx_code === undefined) a.fx_code = null
            if (a.fx_amount === undefined) a.fx_amount = null
          }),
      )

    // v7: cloud-ready. Client-assigned string (UUID) primary keys on synced tables
    // + updated_at index for watermark sync + local syncMeta table. See BACKEND.md §5.
    // chatMessages is intentionally left on its numeric key (local-only, not synced).
    // NOTE: changing a table's primary key requires the store to be recreated — see
    // the migration caveat documented in supabase/README.md before shipping to users
    // with existing local data.
    this.version(7).stores({
      accounts: 'id, account_type, lane, is_active, updated_at',
      assets: 'id, lane, asset_type, last_valued_at, updated_at',
      transactions:
        'id, date, account_id, lane, direction, is_transfer, transfer_pair_id, updated_at, [date+account_id], [date+account_id+direction]',
      categories: 'id, lane, envelope_id, updated_at',
      envelopes: 'id, horizon, period, parent_envelope_id, updated_at',
      recurringItems: 'id, kind, lane, is_active, next_due, updated_at',
      allowance: 'id, updated_at',
      netWorthSnapshots: 'id, &year_month, updated_at',
      incomeEvents: 'id, date, updated_at',
      milestones: 'id, flag_date, status, updated_at',
      assumptions: 'id, updated_at',
      syncMeta: '&key',
    })
  }
}

export const db = new FIDatabase()

// Assign a UUID on insert for any sync table row that doesn't already carry one.
// Pure key assignment only — no cross-table writes, so it is transaction-safe.
for (const name of SYNC_TABLES) {
  db.table(name).hook('creating', (_pk, obj: { id?: string }) => {
    if (!obj.id) obj.id = crypto.randomUUID()
  })
}
