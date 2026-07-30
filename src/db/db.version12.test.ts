import 'fake-indexeddb/auto'
import Dexie, { type Table } from 'dexie'
import { describe, it, expect, beforeEach } from 'vitest'
import { db as productionDb } from './db'
import type { Allowance, Transaction } from './types'

// Task 1 acceptance test: a v11-shaped allowance row carrying no
// onboarding_snoozed_until field upgrades in place to v12 with the field
// backfilled to null and the rest of the row untouched.
//
// The upgrade only runs against the DB name the production singleton owns, so
// the seed DB below uses that exact name: seed at v11, close, then open the
// production `db` — Dexie itself runs the version(12) upgrade callback.

const DB_NAME = 'fi-dashboard-v2'

interface LegacyAllowanceV11 extends Omit<Allowance, 'onboarding_snoozed_until'> {}

/** The cumulative v11 schema, so opening at v12 is a pure upgrade with no store reshape. */
class V11ShapedDb extends Dexie {
  allowance!: Table<LegacyAllowanceV11, string>
  constructor() {
    super(DB_NAME)
    this.version(11).stores({
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
      chatSessions: 'id, archived_at, updated_at, created_at',
      chatMessages: 'id, session_id, created_at, updated_at',
      chatMemories: 'id, updated_at, created_at',
      chatCustomSkills: 'id, updated_at, created_at',
      syncMeta: '&key',
    })
  }
}

/** The cumulative v9 schema (chatMessages is dropped between v8 and v11). */
class V9ShapedDb extends Dexie {
  transactions!: Table<Omit<Transaction, 'title'>, string>
  constructor() {
    super(DB_NAME)
    this.version(9).stores({
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
      chatSessions: 'id, archived_at, updated_at, created_at',
      chatMemories: 'id, updated_at, created_at',
      chatCustomSkills: 'id, updated_at, created_at',
      syncMeta: '&key',
    })
  }
}

/** Seed one allowance row into a v11 DB, then hand the name back to production `db`. */
async function seedAtV11(row: LegacyAllowanceV11 & { onboarding_snoozed_until?: string }) {
  const v11 = new V11ShapedDb()
  await v11.open()
  await v11.allowance.put(row)
  v11.close()
}

beforeEach(async () => {
  productionDb.close()
  await Dexie.delete(DB_NAME)
})

describe('Dexie version(12): allowance.onboarding_snoozed_until', () => {
  it('backfills a v11 row to null without losing data', async () => {
    await seedAtV11({
      id: 'local',
      monthly_amount: 1_500_000,
      weekend_allocation: 250_000,
      updated_at: '2026-07-01T00:00:00.000Z',
    })

    await productionDb.open() // runs the version(12) upgrade

    // updated_at must survive untouched: the upgrade runs under applyingRemote
    // so the 'updating' hook can't restamp it. A bumped watermark would push
    // this row on next sync and beat a newer cloud row on last-write-wins.
    expect(await productionDb.allowance.get('local')).toEqual({
      id: 'local',
      monthly_amount: 1_500_000,
      weekend_allocation: 250_000,
      onboarding_snoozed_until: null,
      updated_at: '2026-07-01T00:00:00.000Z',
    })
  })

  it('leaves an already-set onboarding_snoozed_until alone', async () => {
    await seedAtV11({
      id: 'local',
      monthly_amount: 500_000,
      weekend_allocation: 100_000,
      onboarding_snoozed_until: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    })

    await productionDb.open()

    const got = await productionDb.allowance.get('local')
    expect(got?.onboarding_snoozed_until).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('Dexie version(10): transactions.title backfill', () => {
  it('backfills title to null without restamping updated_at', async () => {
    const legacy = {
      id: '11111111-1111-4111-8111-111111111111',
      date: '2026-06-01',
      amount: 42_000,
      direction: 'out',
      account_id: '22222222-2222-4222-8222-222222222222',
      category_id: null,
      lane: 'personal',
      source: 'manual',
      note: null,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: false,
      transfer_pair_id: null,
      recurring_item_id: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    } as unknown as Omit<Transaction, 'title'>

    const v9 = new V9ShapedDb()
    await v9.open()
    await v9.transactions.put(legacy)
    v9.close()

    await productionDb.open() // runs versions 10, 11 and 12

    const got = (await productionDb.transactions.get(
      '11111111-1111-4111-8111-111111111111',
    )) as (Transaction & { updated_at: string }) | undefined
    expect(got?.title).toBeNull()
    expect(got?.amount).toBe(42_000)
    // Same watermark guarantee as v12: a backfill must not mark the row dirty.
    expect(got?.updated_at).toBe('2026-06-01T00:00:00.000Z')
  })
})
