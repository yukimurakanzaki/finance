import { db } from '../db'
import type { Category } from '../types'

export const categoriesRepo = {
  getAll: () => db.categories.toArray(),

  create: (data: Omit<Category, 'id'>) => db.categories.add(data),

  update: (id: number, patch: Partial<Category>) => db.categories.update(id, patch),
}
