import { db, type RepFuelDB } from './db'
import type { DayOverride, Entry, Food, SettingRow, WeightLog } from './types'

export const BACKUP_APP = 'repfuel'
export const BACKUP_SCHEMA = 1

export interface Backup {
  app: typeof BACKUP_APP
  schema: number
  exportedAt: string
  foods: Food[]
  entries: Entry[]
  days: DayOverride[]
  weights: WeightLog[]
  settings: SettingRow[]
  meta: { key: string; value: number }[]
}

export async function exportBackup(database: RepFuelDB = db): Promise<Backup> {
  return database.transaction('r', database.tables, async () => ({
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    foods: await database.foods.toArray(),
    entries: await database.entries.toArray(),
    days: await database.days.toArray(),
    weights: await database.weights.toArray(),
    settings: await database.settings.toArray(),
    meta: await database.meta.toArray(),
  }))
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("This file isn't a RepFuel backup. Choose a .json file exported from RepFuel.")
  }
  const b = data as Partial<Backup>
  if (b?.app !== BACKUP_APP) throw new Error("This file isn't a RepFuel backup. Choose a .json file exported from RepFuel.")
  if (typeof b.schema !== 'number' || b.schema > BACKUP_SCHEMA) throw new Error('This backup is from a newer version of RepFuel. Update the app, then import again.')
  for (const k of ['foods', 'entries', 'days', 'weights', 'settings', 'meta'] as const) {
    if (!Array.isArray(b[k])) throw new Error(`This backup is missing its ${k} list, so it can't be imported.`)
  }
  return b as Backup
}

/** Replaces everything in the app with the backup, all-or-nothing. */
export async function restoreBackup(backup: Backup, database: RepFuelDB = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()))
    await database.foods.bulkPut(backup.foods)
    await database.entries.bulkPut(backup.entries)
    await database.days.bulkPut(backup.days)
    await database.weights.bulkPut(backup.weights)
    await database.settings.bulkPut(backup.settings)
    await database.meta.bulkPut(backup.meta)
  })
}
