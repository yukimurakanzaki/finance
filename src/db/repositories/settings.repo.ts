import { db } from '../db'
import type { AppSettingKey } from '../types'

const now = () => new Date().toISOString()

export const settingsRepo = {
  get: (key: AppSettingKey) => db.appSettings.get(key).then((r) => r?.value ?? null),

  set: (key: AppSettingKey, value: string) =>
    db.appSettings.put({ key, value, updated_at: now() }),

  getAll: () => db.appSettings.toArray(),
}
