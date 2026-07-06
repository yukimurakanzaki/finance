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
  milestones: 'milestones',
  netWorthSnapshots: 'net_worth_snapshots',
  allowance: 'allowances',
  assumptions: 'assumptions',
  chatSessions: 'chat_sessions',
  chatMessages: 'chat_messages',
  chatMemories: 'chat_memories',
  chatCustomSkills: 'chat_custom_skills',
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
  if (SINGLETON[table]) {
    const { household_id: _h, member_id: _m, ...rest } = row
    return { id: 'local', ...rest }
  }
  const { household_id: _h, ...rest } = row
  return { ...rest, id: row.id }
}
