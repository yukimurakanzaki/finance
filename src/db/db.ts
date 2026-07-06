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
  ChatSession,
  ChatMemory,
  ChatCustomSkill,
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
  'chatSessions',
  'chatMessages',
  'chatMemories',
  'chatCustomSkills',
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
  chatSessions!: Table<ChatSession, string>
  chatMessages!: Table<ChatMessage, string>
  chatMemories!: Table<ChatMemory, string>
  chatCustomSkills!: Table<ChatCustomSkill, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    // New DB name for the cloud era. IndexedDB cannot change a store's primary
    // key on an existing database, and v7 switches from auto-increment numeric
    // keys to client-assigned UUIDs — so upgrading the old 'fi-dashboard' DB in
    // place would fail. A fresh name gives existing devices a clean v7 database;
    // their old local data remains in the 'fi-dashboard' DB and can be recovered
    // via backup/restore. Cloud sync is the new source of truth.
    super('fi-dashboard-v2')

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

    // v8: multi-session chat with UUID keys, synced to cloud.
    // chatMessages moves from numeric autoincrement to string UUID primary key.
    this.version(8).stores({
      chatSessions: 'id, archived_at, updated_at, created_at',
      chatMessages: 'id, session_id, created_at, updated_at',
    })

    // v9: persistent AI memory + user-created custom skills
    this.version(9).stores({
      chatMemories: 'id, updated_at, created_at',
      chatCustomSkills: 'id, updated_at, created_at',
    })
  }
}

export const db = new FIDatabase()

// While applying rows pulled from the cloud, suppress the hooks below so we don't
// re-stamp updated_at (which would make pulled rows look dirty and echo back).
export const syncControl = { applyingRemote: false }

const nowIso = () => new Date().toISOString()

// On every local write to a synced table: assign a UUID if missing and stamp
// updated_at. updated_at is the watermark the sync engine pushes on, so it must
// be set for a row to ever sync. Pure field assignment — transaction-safe.
for (const name of SYNC_TABLES) {
  const table = db.table(name)
  table.hook('creating', (_pk, obj: { id?: string; updated_at?: string }) => {
    if (syncControl.applyingRemote) return
    if (!obj.id) obj.id = crypto.randomUUID()
    if (!obj.updated_at) obj.updated_at = nowIso()
  })
  table.hook('updating', () => {
    if (syncControl.applyingRemote) return
    return { updated_at: nowIso() }
  })
}
