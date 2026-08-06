import { db } from '../db'
import { deletionsRepo } from './deletions.repo'
import type { Asset } from '../types'

const now = () => new Date().toISOString()

export const assetsRepo = {
  getAll: () => db.assets.toArray(),

  getById: (id: string) => db.assets.get(id),

  create: (data: Omit<Asset, 'id' | 'created_at'>) =>
    db.assets.add({ ...data, created_at: now() }),

  update: (id: string, patch: Partial<Asset>) => db.assets.update(id, patch),

  updateValue: (id: string, value: number) =>
    db.assets.update(id, { value, last_valued_at: now().slice(0, 10) }),

  // Assets had no delete path at all until D2 — create and edit, forever.
  // Routed through deletionsRepo so the delete carries a tombstone and stays
  // deleted on the other devices. Past net-worth snapshots are untouched: they
  // record what was true then, not a live view.
  remove: (id: string) => deletionsRepo.remove('assets', id),
}
