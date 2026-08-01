import { db } from '../db'

const now = () => new Date().toISOString()

// Deletes that survive sync. See the `Deletion` type for why the watermark
// engine needs this: a locally deleted row simply stops being pushed, so the
// cloud copy and every other device keep it, and a fresh hydrate brings it back.
//
// The row is genuinely deleted locally rather than tombstoned in place, so no
// read anywhere in the app has to learn about deletion — which matters when
// ~55 call sites read db.transactions and forgetting one silently corrupts a
// balance.
export const deletionsRepo = {
  /**
   * Delete a row and record that it was deleted, in one transaction — a delete
   * without its tombstone is exactly the bug this exists to prevent.
   */
  async remove(tableName: string, rowId: string): Promise<void> {
    await db.transaction('rw', db.table(tableName), db.deletions, async () => {
      await db.table(tableName).delete(rowId)
      // id is the deleted row's own id, so deleting twice rewrites the same
      // record rather than accumulating duplicates.
      await db.deletions.put({
        id: rowId,
        table_name: tableName,
        row_id: rowId,
        created_at: now(),
      })
    })
  },

  /** Several rows, one transaction — e.g. both legs of a transfer. */
  async removeMany(tableName: string, rowIds: string[]): Promise<void> {
    if (rowIds.length === 0) return
    await db.transaction('rw', db.table(tableName), db.deletions, async () => {
      await db.table(tableName).bulkDelete(rowIds)
      await db.deletions.bulkPut(
        rowIds.map((row_id) => ({
          id: row_id,
          table_name: tableName,
          row_id,
          created_at: now(),
        })),
      )
    })
  },

  /**
   * Apply every tombstone to the local database. Runs after a pull, so rows
   * another device deleted go away here too.
   *
   * Idempotent and order-independent: deleting an already-absent row is a
   * no-op, so this can run every cycle over the whole log without tracking
   * which tombstones have been applied.
   */
  async apply(): Promise<void> {
    const tombstones = await db.deletions.toArray()
    if (tombstones.length === 0) return

    const known = new Set(db.tables.map((t) => t.name))
    const byTable = new Map<string, string[]>()
    for (const t of tombstones) {
      // A tombstone from a newer app version may name a table this build
      // doesn't have. Skipping beats throwing and wedging the sync cycle.
      if (!known.has(t.table_name)) continue
      const bucket = byTable.get(t.table_name)
      if (bucket) bucket.push(t.row_id)
      else byTable.set(t.table_name, [t.row_id])
    }

    for (const [tableName, ids] of byTable) {
      await db.table(tableName).bulkDelete(ids)
    }
  },
}
