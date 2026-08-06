import 'fake-indexeddb/auto'
import Dexie, { type Table } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db as productionDb } from './db'
import type { Allowance } from './types'

// Regression test for reconciling `main` and
// `claude/fi-dashboard-safe-to-spend-ot3w4b`: main's v13 (numeric-string
// scrub) is what's actually deployed to production, so it's untouchable —
// `balanceCorrections` and `deletions` had to be renumbered to v14/v15 to
// land after it. The renumbering initially broke the v13 upgrade itself: it
// looped the SYNC_TABLES constant, which now includes those v14/v15 tables —
// tables that don't exist yet in the transaction Dexie hands a v13 upgrade
// step, throwing "Table balanceCorrections not part of transaction".
//
// Seeds a v11-shaped DB (same convention as db.version12.test.ts) so opening
// the current `db` runs the real v12 -> v13 -> v14 -> v15 chain end to end —
// exactly what any device that hasn't opened the app since before this
// reconciliation will do — and confirms it completes with both new tables
// present and usable.

const DB_NAME = 'fi-dashboard-v2'

interface LegacyAllowanceV11
  extends Omit<Allowance, 'onboarding_snoozed_until'> {}

/** The cumulative v11 schema, so opening at v12+ is a pure upgrade with no store reshape. */
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

beforeEach(async () => {
  productionDb.close()
  await Dexie.delete(DB_NAME)
})

describe('Dexie v11 -> v15: reconciling main and the fi-dashboard branch', () => {
  it('runs the full v12-v15 chain on an old device without touching not-yet-created tables', async () => {
    const v11 = new V11ShapedDb()
    await v11.open()
    await v11.allowance.put({
      id: 'local',
      monthly_amount: 1_000_000,
      weekend_allocation: 200_000,
      updated_at: '2026-07-20T00:00:00.000Z',
    })
    v11.close()

    // Runs v12 (onboarding_snoozed_until), v13 (numeric-string scrub), v14
    // (balanceCorrections) and v15 (deletions) in sequence. Threw "Table
    // balanceCorrections not part of transaction" from the v13 step before
    // it was scoped to a frozen table list instead of the live SYNC_TABLES.
    await expect(productionDb.open()).resolves.toBeDefined()

    // Pre-existing data survived (plus v12's backfill), and both new tables
    // introduced by this reconciliation are live and usable.
    expect(await productionDb.allowance.get('local')).toMatchObject({
      monthly_amount: 1_000_000,
      onboarding_snoozed_until: null,
    })
    await expect(productionDb.balanceCorrections.toArray()).resolves.toEqual([])
    await expect(productionDb.deletions.toArray()).resolves.toEqual([])
  })
})
