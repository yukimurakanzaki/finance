import { db } from '../db'
import type { NetWorthSnapshot } from '../types'

const now = () => new Date().toISOString()

export const snapshotsRepo = {
  getAll: () => db.netWorthSnapshots.orderBy('year_month').toArray(),

  getByMonth: (ym: string) =>
    db.netWorthSnapshots.where('year_month').equals(ym).first(),

  upsert: (snapshot: Omit<NetWorthSnapshot, 'id'>) =>
    db.transaction('rw', db.netWorthSnapshots, async () => {
      const existing = await db.netWorthSnapshots
        .where('year_month')
        .equals(snapshot.year_month)
        .first()
      if (existing?.id) return db.netWorthSnapshots.update(existing.id, snapshot)
      return db.netWorthSnapshots.add(snapshot)
    }),
}
