import { db, SYNC_TABLES, syncControl, type SyncTable } from '@db/db'
import { migrateLegacyIds } from '@lib/legacyIdMigration'
import { supabase } from '@lib/supabaseClient'
import {
  CLOUD_TABLE,
  cloudConflictKey,
  fromCloudRow,
  isSyncable,
  maxUpdatedAt,
  toCloudRow,
} from '@lib/syncMappers'

// Watermark-based sync (BACKEND.md §5). No write-hooks, no outbox: every row
// carries updated_at, so we push local rows changed since the last push and pull
// cloud rows changed since the last pull. Server-side LWW makes re-pushes
// idempotent, so occasional echo is harmless.

const EPOCH = '1970-01-01T00:00:00.000Z'

// Untyped view of the client for the generic sync path (dynamic table names).
type LooseQuery = {
  select: (cols: string) => LooseQuery
  upsert: (rows: unknown, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>
  eq: (col: string, val: string) => LooseQuery
  gt: (col: string, val: string) => LooseQuery
  order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>
}
const sb = () => supabase as unknown as { from: (t: string) => LooseQuery }

async function getMeta(key: string): Promise<string> {
  const m = await db.syncMeta.get(key)
  return m?.value ?? EPOCH
}
async function setMeta(key: string, value: string): Promise<void> {
  await db.syncMeta.put({ key, value })
}

async function pushTable(table: SyncTable, householdId: string, userId: string): Promise<number> {
  const since = await getMeta(`pushed:${table}`)
  const local = await db.table(table).toArray()
  const dirty = local.filter((r) => isSyncable(table, r) && (r.updated_at ?? EPOCH) > since)
  if (dirty.length === 0) return 0

  const cloudRows = dirty.map((r) => toCloudRow(table, r, householdId, userId))
  const { error } = await sb()
    .from(CLOUD_TABLE[table])
    .upsert(cloudRows, { onConflict: cloudConflictKey(table) })
  if (error) throw new Error(`push ${table}: ${error.message}`)

  await setMeta(`pushed:${table}`, maxUpdatedAt(dirty, since))
  return dirty.length
}

async function pullTable(table: SyncTable, householdId: string, userId: string): Promise<number> {
  const since = await getMeta(`pulled:${table}`)
  let query = sb().from(CLOUD_TABLE[table]).select('*').eq('household_id', householdId).gt('updated_at', since)
  // allowance is per-member: only pull this user's own row (it collapses to one
  // local singleton), otherwise a member would inherit another member's allowance.
  if (table === 'allowance') query = query.eq('member_id', userId)
  const { data, error } = await query.order('updated_at', { ascending: true })
  if (error) throw new Error(`pull ${table}: ${error.message}`)
  const remote = (data ?? []) as Array<Record<string, unknown>>
  if (remote.length === 0) return 0

  const localRows = remote.map((r) => fromCloudRow(table, r))
  // Suppress the updated_at/uuid hooks so pulled rows keep their server timestamps.
  syncControl.applyingRemote = true
  try {
    await db.table(table).bulkPut(localRows)
  } finally {
    syncControl.applyingRemote = false
  }
  await setMeta(`pulled:${table}`, maxUpdatedAt(remote as Array<{ updated_at?: string }>, since))
  return remote.length
}

// Guard against overlapping/duplicate sync cycles (auth events can fire several times).
let syncing = false

/** One full sync cycle: push then pull every table. Safe to call repeatedly. */
export async function syncNow(householdId: string, userId: string): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    // Re-key any pre-cloud rows (numeric ids from a restored backup) to UUIDs
    // so they become pushable. No-op on devices without legacy rows.
    const migrated = await migrateLegacyIds()
    if (migrated > 0) console.info(`sync: re-keyed ${migrated} legacy rows to UUIDs`)
    for (const table of SYNC_TABLES) await pushTable(table, householdId, userId)
    for (const table of SYNC_TABLES) await pullTable(table, householdId, userId)
  } finally {
    syncing = false
  }
}
