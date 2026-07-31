import type { SyncTable } from '@db/db'

// Pure mapping logic between local Dexie rows and cloud rows. No IO — unit-tested
// in syncMappers.test.ts. sync.ts wires these to Dexie + Supabase.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Local Dexie table name -> cloud table name.
export const CLOUD_TABLE: Record<SyncTable, string> = {
  accounts: 'accounts',
  envelopes: 'envelopes',
  categories: 'categories',
  assets: 'assets',
  recurringItems: 'recurring_items',
  incomeEvents: 'income_events',
  transactions: 'transactions',
  balanceCorrections: 'balance_corrections',
  milestones: 'milestones',
  netWorthSnapshots: 'net_worth_snapshots',
  allowance: 'allowances',
  assumptions: 'assumptions',
  chatSessions: 'chat_sessions',
  chatMessages: 'chat_messages',
  chatMemories: 'chat_memories',
  chatCustomSkills: 'chat_custom_skills',
  deletions: 'deletions',
}

// Singleton local tables map to a natural cloud key instead of an `id` uuid.
export const SINGLETON: Partial<Record<SyncTable, true>> = {
  allowance: true,
  assumptions: true,
}

export function cloudConflictKey(table: SyncTable): string {
  if (table === 'allowance') return 'household_id,member_id'
  if (table === 'assumptions') return 'household_id'
  return 'id'
}

/** True when a local row is safe to push (has a UUID id, or is a singleton). */
export function isSyncable(table: SyncTable, row: { id?: string }): boolean {
  if (SINGLETON[table]) return true
  return typeof row.id === 'string' && UUID_RE.test(row.id)
}

/** Later of the batch's updated_at values and the current watermark. */
export function maxUpdatedAt(rows: Array<{ updated_at?: string }>, since: string): string {
  return rows.reduce((mx, r) => (r.updated_at && r.updated_at > mx ? r.updated_at : mx), since)
}

/** Strip local-only fields and stamp the cloud tenancy columns. */
export function toCloudRow(
  table: SyncTable,
  row: Record<string, unknown>,
  householdId: string,
  userId: string,
): Record<string, unknown> {
  if (table === 'allowance') {
    const { id: _id, ...rest } = row
    return { household_id: householdId, member_id: userId, ...rest }
  }
  if (table === 'assumptions') {
    const { id: _id, ...rest } = row
    return { household_id: householdId, ...rest }
  }
  return { ...row, household_id: householdId }
}

/** Cloud row -> local Dexie row (singletons collapse to the fixed local id). */
export function fromCloudRow(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const coerced = coerceNumeric(table, row)
  if (SINGLETON[table]) {
    const { household_id: _h, member_id: _m, ...rest } = coerced
    return { id: 'local', ...rest }
  }
  const { household_id: _h, ...rest } = coerced
  return { ...rest, id: row.id }
}

// Number-typed fields per syncable table. Postgres returns bigint as a string
// over the wire (no precision loss past 2^53), so a row we pull can carry
// "295.32" where our Dexie schema says `number`. Re-pushing that string to
// the cloud's bigint column 400s, which is the recurring sync error
// `pushTable` was throwing. Coerce here so the local copy — and every future
// push — stays numeric. Anything not on this list is left as the cloud sent
// it; that matches the existing syncMappers.test.ts expectations.
//
// Not Partial: a full Record forces every new syncable table to declare its
// numeric fields (or an explicit []) instead of silently inheriting the bug.
export const NUMERIC: Record<SyncTable, readonly string[]> = {
  transactions: ['amount', 'original_amount', 'overridden_amount'],
  balanceCorrections: ['previous_balance', 'new_balance'],
  accounts: ['manual_balance_override'],
  assets: ['value', 'quantity_grams', 'price_per_gram', 'fx_amount'],
  envelopes: ['target_amount'],
  recurringItems: ['amount'],
  allowance: ['monthly_amount', 'weekend_allocation'],
  incomeEvents: [
    'gross',
    'take_home_net',
    'delta_vs_prev',
    'routed_to_pipe',
    'routed_to_lifestyle',
  ],
  assumptions: [
    'target_low',
    'target_high',
    'return_rdpu',
    'return_equity',
    'return_dplk',
    'return_gold',
    'inflation_rate',
    'equity_switch_month',
    'lifestyle_ceiling_monthly',
  ],
  netWorthSnapshots: ['total'],
  chatSessions: ['message_count', 'total_input_tokens', 'total_output_tokens'],
  chatMessages: ['input_tokens', 'output_tokens'],
  milestones: [],
  categories: [],
  chatMemories: [],
  chatCustomSkills: [],
  deletions: [],
}

function coerceNumeric(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const fields = NUMERIC[table]
  if (!fields || fields.length === 0) return row
  const out = { ...row }
  for (const k of fields) {
    const v = out[k]
    if (typeof v === 'string' && v !== '') {
      const n = Number(v)
      if (Number.isFinite(n)) out[k] = n
    }
  }
  return out
}

// Shared helper: scrub any already-corrupted local rows where a numeric field
// arrived as a string from a prior pull (before `coerceNumeric` existed in
// `fromCloudRow`). Used by the Dexie v12 upgrade and by tests.
export function scrubNumericStrings(table: SyncTable, row: Record<string, unknown>): boolean {
  const fields = NUMERIC[table]
  if (!fields || fields.length === 0) return false
  let changed = false
  for (const k of fields) {
    const v = row[k]
    if (typeof v === 'string' && v !== '') {
      const n = Number(v)
      if (Number.isFinite(n)) {
        row[k] = n
        changed = true
      }
    }
  }
  return changed
}
