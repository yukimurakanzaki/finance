import { db } from '@db/db'

// BACKEND.md §8: rows restored from a pre-cloud backup carry numeric ids, but
// only UUID-keyed rows sync (isSyncable). This one-time migration re-keys any
// legacy row to a UUID, rewrites the FKs between them, and stamps updated_at so
// the rows become pushable. Atomic: one Dexie rw-transaction, rolls back on error.
// Idempotent: devices with no legacy rows do nothing.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isLegacyId = (id: unknown): boolean =>
  id !== undefined && !(typeof id === 'string' && UUID_RE.test(id))

// Tables with client UUID ids, parents before children (FK rewrite order).
const TABLES = [
  'envelopes',
  'accounts',
  'categories',
  'assets',
  'recurringItems',
  'incomeEvents',
  'transactions',
  'milestones',
  'netWorthSnapshots',
] as const

// child field -> table whose id map rewrites it
const FK_FIELDS: Partial<Record<(typeof TABLES)[number], Record<string, (typeof TABLES)[number]>>> = {
  categories: { envelope_id: 'envelopes' },
  envelopes: { parent_envelope_id: 'envelopes' },
  transactions: { account_id: 'accounts', category_id: 'categories' },
  milestones: { income_event_id: 'incomeEvents' },
}

export async function migrateLegacyIds(): Promise<number> {
  // Cheap pre-check outside the transaction: any legacy row anywhere?
  let any = false
  for (const t of TABLES) {
    const rows = (await db.table(t).toArray()) as Array<{ id?: unknown }>
    if (rows.some((r) => isLegacyId(r.id))) {
      any = true
      break
    }
  }
  if (!any) return 0

  const now = new Date().toISOString()
  let migrated = 0

  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    // old id (as string) -> new uuid, per table
    const idMaps: Record<string, Map<string, string>> = {}

    for (const t of TABLES) {
      const map = new Map<string, string>()
      idMaps[t] = map
      const rows = (await db.table(t).toArray()) as Array<Record<string, unknown>>
      for (const row of rows) {
        if (!isLegacyId(row.id)) continue
        const oldKey = row.id as string | number
        const newId = crypto.randomUUID()
        map.set(String(oldKey), newId)
        await db.table(t).delete(oldKey as never)
        await db.table(t).add({ ...row, id: newId, updated_at: now })
        migrated++
      }
    }

    // Rewrite FK fields that still point at a re-keyed parent. Covers both
    // legacy children (already re-added above) and UUID children referencing
    // a legacy parent.
    for (const t of TABLES) {
      const fks = FK_FIELDS[t]
      if (!fks) continue
      const rows = (await db.table(t).toArray()) as Array<Record<string, unknown>>
      for (const row of rows) {
        const patch: Record<string, unknown> = {}
        for (const [field, refTable] of Object.entries(fks)) {
          const ref = row[field]
          if (ref === null || ref === undefined) continue
          const mapped = idMaps[refTable]?.get(String(ref))
          if (mapped) patch[field] = mapped
        }
        if (Object.keys(patch).length > 0) {
          await db.table(t).update(row.id as string, { ...patch, updated_at: now })
        }
      }
    }
  })

  return migrated
}
