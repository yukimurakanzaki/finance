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

class FIDatabase extends Dexie {
  accounts!: Table<Account, number>
  assets!: Table<Asset, number>
  transactions!: Table<Transaction, number>
  categories!: Table<Category, number>
  envelopes!: Table<Envelope, number>
  recurringItems!: Table<RecurringItem, number>
  allowance!: Table<Allowance, number>
  netWorthSnapshots!: Table<NetWorthSnapshot, number>
  incomeEvents!: Table<IncomeEvent, number>
  milestones!: Table<Milestone, number>
  assumptions!: Table<Assumptions, number>
  appSettings!: Table<AppSetting, string>
  chatMessages!: Table<ChatMessage, number>

  constructor() {
    super('fi-dashboard')

    // v1: Phase 1 skeleton
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

    // v5: AI finance manager chat history
    this.version(5).stores({
      chatMessages: '++id, created_at',
    })

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
  }
}

export const db = new FIDatabase()
