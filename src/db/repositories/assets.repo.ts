import { db } from '../db'
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
}
