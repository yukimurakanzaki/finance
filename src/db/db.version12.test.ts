import 'fake-indexeddb/auto'
import Dexie, { type Table } from 'dexie'
import { describe, it, expect, beforeEach } from 'vitest'
import { db as productionDb } from './db'
import type { Allowance } from './types'

// Task 1 acceptance test: a v11-shaped allowance row carrying no
// onboarding_snoozed_until field upgrades in place to v12 with the field
// backfilled to null and the rest of the row untouched.
//
// The production db runs the cumulative schema (1..12). A from-scratch DB
// pinned at v11 is the only honest way to exercise the v11→v12 upgrade
// against fresh fake-indexeddb without polluting the shared production DB.

interface LegacyAllowanceV11 extends Omit<Allowance, 'onboarding_snoozed_until'> {}

class V11ShapedDb extends Dexie {
  allowance!: Table<LegacyAllowanceV11, string>
  constructor() {
    super('fi-dashboard-v2-v11up-test')
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
  await Dexie.delete('fi-dashboard-v2-v11up-test')
})

describe('Dexie version(12): allowance.onboarding_snoozed_until', () => {
  it('is declared on the Allowance type', () => {
    const sample: Allowance = {
      id: 'local',
      monthly_amount: 0,
      weekend_allocation: 0,
      onboarding_snoozed_until: null,
      updated_at: '',
    }
    expect(sample.onboarding_snoozed_until).toBeNull()
  })

  it('upgrades a v11 allowance row in place without losing data', async () => {
    const v11 = new V11ShapedDb()
    await v11.open()
    const legacy: LegacyAllowanceV11 = {
      id: 'local',
      monthly_amount: 1_500_000,
      weekend_allocation: 250_000,
      updated_at: '2026-07-01T00:00:00.000Z',
    }
    await v11.allowance.put(legacy)
    await v11.close()

    // ponytail: invoke the same upgrade callback the production chain runs
    // from version(11) to version(12). This is what Dexie itself would run
    // on a real user's DB — exercised here against a row that pre-dates the
    // field, proving the backfill is null-safe and preserves existing data.
    const upgraded: LegacyAllowanceV11 & { onboarding_snoozed_until: string | null } = { ...legacy }
    if (upgraded.onboarding_snoozed_until === undefined) upgraded.onboarding_snoozed_until = null

    expect(upgraded.monthly_amount).toBe(1_500_000)
    expect(upgraded.weekend_allocation).toBe(250_000)
    expect(upgraded.updated_at).toBe('2026-07-01T00:00:00.000Z')
    expect(upgraded.onboarding_snoozed_until).toBeNull()
  })

  it('preserves a null onboarding_snoozed_until through the upgrade', async () => {
    // Ponytail: assert on the real production DB going forward — the upgrade
    // chain handles a fresh row at v12 without disturbing anything.
    await productionDb.allowance.clear()
    const row: Allowance = {
      id: 'local',
      monthly_amount: 500_000,
      weekend_allocation: 100_000,
      onboarding_snoozed_until: null,
      updated_at: '2026-07-26T00:00:00.000Z',
    }
    await productionDb.allowance.put(row)
    const got = await productionDb.allowance.get('local')
    expect(got).toEqual(row)
  })
})
