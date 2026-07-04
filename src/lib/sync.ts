import { db, SYNC_TABLES, type SyncTable } from '@db/db'
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

async function pullTable(table: SyncTable, householdId: string): Promise<number> {
  const since = await getMeta(`pulled:${table}`)
  const { data, error } = await sb()
    .from(CLOUD_TABLE[table])
    .select('*')
    .eq('household_id', householdId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw new Error(`pull ${table}: ${error.message}`)
  const remote = (data ?? []) as Array<Record<string, unknown>>
  if (remote.length === 0) return 0

  const localRows = remote.map((r) => fromCloudRow(table, r))
  await db.table(table).bulkPut(localRows)
  await setMeta(`pulled:${table}`, maxUpdatedAt(remote as Array<{ updated_at?: string }>, since))
  return remote.length
}

/** One full sync cycle: push then pull every table. Safe to call repeatedly. */
export async function syncNow(householdId: string, userId: string): Promise<void> {
  for (const table of SYNC_TABLES) await pushTable(table, householdId, userId)
  for (const table of SYNC_TABLES) await pullTable(table, householdId)
}
