import Dexie, { type Table } from 'dexie'
import { scrubNumericStrings } from '@lib/syncMappers'
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
        withoutRestamp(() =>
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
        ),
      )

    // v4: milestone gains income_event_id FK
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        withoutRestamp(() =>
          tx
            .table<Milestone>('milestones')
            .toCollection()
            .modify((m) => {
              if (m.income_event_id === undefined) m.income_event_id = null
            }),
        ),
      )

    // v5: AI finance manager chat history (local-only, stays numeric autoincrement)
    this.version(5).stores({
      chatMessages: '++id, created_at',
    })

    // v6: auto market pricing fields on assets
    this.version(6)
      .stores({})
      .upgrade((tx) =>
        withoutRestamp(() =>
          tx
            .table<Asset>('assets')
            .toCollection()
            .modify((a) => {
              if (a.auto_price === undefined) a.auto_price = null
              if (a.fx_code === undefined) a.fx_code = null
              if (a.fx_amount === undefined) a.fx_amount = null
            }),
        ),
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
    // IndexedDB can't change a store's primary key in place (see v7's DB-rename
    // note above), so drop it here and recreate it at v11 — Dexie's documented
    // pattern for a primary-key change.
    this.version(8).stores({
      chatSessions: 'id, archived_at, updated_at, created_at',
      chatMessages: null,
    })

    // v9: persistent AI memory + user-created custom skills
    this.version(9).stores({
      chatMemories: 'id, updated_at, created_at',
      chatCustomSkills: 'id, updated_at, created_at',
    })

    // v10: user-facing title on transactions (note becomes the optional description)
    this.version(10)
      .stores({})
      .upgrade((tx) =>
        withoutRestamp(() =>
          tx
            .table<Transaction>('transactions')
            .toCollection()
            .modify((t) => {
              if (t.title === undefined) t.title = null
            }),
        ),
      )

    // v11: recreate chatMessages with its v8 schema (string UUID key) now that
    // the old auto-increment store has been dropped.
    this.version(11).stores({
      chatMessages: 'id, session_id, created_at, updated_at',
    })

    // v12: allowance.onboarding_snoozed_until (T1a / TR-1.1). Schema unchanged
    // (no new index — readers filter by reading the row); the upgrade just
    // backfills the field to null so existing rows match the v12 type.
    this.version(12)
      .stores({})
      .upgrade((tx) =>
        withoutRestamp(() =>
          tx
            .table<Allowance>('allowance')
            .toCollection()
            .modify((a) => {
              if (a.onboarding_snoozed_until === undefined) a.onboarding_snoozed_until = null
            }),
        ),
      )

    // transactions.recurring_item_id (tags a committed recurring payment so it
    // no longer draws the personal pool) needs NO schema version: it is not
    // indexed, and readers treat missing/undefined as untagged (isWeekDraw),
    // so a full-table backfill upgrade would only slow startup for nothing.

    // v13: scrub string-typed numeric fields from synced tables. Before
    // `coerceNumeric` lived in `fromCloudRow`, a cloud pull could land a
    // Postgres bigint (returned as a string over the wire) into a Dexie
    // number column, and the next sync push would 400 on the same bigint
    // column. Walk every synced table once, coerce in place, and reset the
    // push watermark for any table where at least one row was touched so
    // the corrected values re-upload to the cloud on the next sync cycle.
    // Runs once per device, no-op when no rows match.
    //
    // Authored as v12 on `sprint1/t4-import-reliability`, which branched
    // before Sprint 1 Task 1 claimed v12 for `onboarding_snoozed_until`.
    // Renumbered to 13 on cherry-pick: two `.version(12)` blocks merge
    // without a git conflict but break the upgrade chain at runtime.
    this.version(13)
      .stores({})
      .upgrade(async (tx) => {
        for (const name of SYNC_TABLES) {
          let touched = 0
          await tx
            .table(name)
            .toCollection()
            .modify((row: Record<string, unknown>) => {
              if (scrubNumericStrings(name as SyncTable, row)) touched++
            })
          if (touched > 0) {
            // Force a re-push of this table by rewinding its push watermark.
            // Dexie's `.modify()` bypasses our `updating` hook, so `updated_at`
            // is unchanged and the watermark would otherwise skip the row.
            await tx
              .table('syncMeta')
              .put({ key: `pushed:${name}`, value: '1970-01-01T00:00:00.000Z' })
          }
        }
      })
  }
}

export const db = new FIDatabase()

// While applying rows pulled from the cloud, suppress the hooks below so we don't
// re-stamp updated_at (which would make pulled rows look dirty and echo back).
export const syncControl = { applyingRemote: false }

// Schema-upgrade backfills reuse the applyingRemote flag so the 'updating' hook
// below leaves updated_at alone. A backfill is not a user edit: a bumped
// watermark would push every touched row on the next sync and beat a newer
// cloud row on last-write-wins. Saves/restores rather than clearing the flag so
// it can never stomp a sync that is already holding it.
async function withoutRestamp(work: () => PromiseLike<unknown>): Promise<void> {
  const prev = syncControl.applyingRemote
  syncControl.applyingRemote = true
  try {
    await work()
  } finally {
    syncControl.applyingRemote = prev
  }
}

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
