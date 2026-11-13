import Dexie, { type EntityTable } from 'dexie'
import type { DayOverride, Entry, Exercise, Food, PlanDay, SettingRow, TrainSession, WeekPlan, WeightLog } from './types'
import { SEED_EXERCISES, SEED_PLAN } from './workoutSeed'
import { REMOVED_SEED_KEYS, SEED_FOODS, SEED_VERSION } from './seedFoods'
import { DEFAULT_SETTINGS } from './defaults'

export class RepFuelDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  entries!: EntityTable<Entry, 'id'>
  days!: EntityTable<DayOverride, 'date'>
  weights!: EntityTable<WeightLog, 'date'>
  settings!: EntityTable<SettingRow, 'key'>
  meta!: EntityTable<{ key: string; value: number }, 'key'>
  exercises!: EntityTable<Exercise, 'id'>
  plan!: EntityTable<PlanDay, 'id'>
  sessions!: EntityTable<TrainSession, 'date'>
  weeks!: EntityTable<WeekPlan, 'week'>

  constructor(name = 'repfuel') {
    super(name)
    // Schema v1. To change the schema later, add this.version(2).stores({...}).upgrade(...) — never edit v1.
    this.version(1).stores({
      foods: '++id, &seedKey, name, category, archived',
      entries: '++id, date, foodId, createdAt',
      days: 'date',
      weights: 'date',
      settings: 'key',
      meta: 'key',
    })
    // v2: training plan (exercises shared across days), one session per trained day, one schedule per Mon–Sun week.
    this.version(2).stores({
      exercises: 'id',
      plan: 'id, order',
      sessions: 'date',
      weeks: 'week',
    })
  }
}

export const db = new RepFuelDB()

/**
 * Adds any built-in foods that aren't in the database yet. Safe to run on every launch:
 * it never overwrites foods the user has edited and never re-adds ones they deleted.
 */
export async function ensureSeeded(database: RepFuelDB = db): Promise<void> {
  await ensureWorkoutSeeded(database)
  await database.transaction('rw', database.foods, database.settings, database.meta, async () => {
    const seeded = (await database.meta.get('seedVersion'))?.value ?? 0
    if (!(await database.settings.get('settings'))) {
      await database.settings.put({ key: 'settings', value: DEFAULT_SETTINGS })
    }
    if (seeded >= SEED_VERSION) return

    // Deleted foods are archived (soft-deleted), so they still count as existing here and won't come back.
    const existing = new Set((await database.foods.toArray()).map((x) => x.seedKey).filter(Boolean))
    const now = Date.now()
    const toAdd: Food[] = SEED_FOODS.filter((s) => !existing.has(s.seedKey)).map((s) => ({
      ...s,
      estimate: s.estimate ?? false,
      archived: 0,
      createdAt: now,
      updatedAt: now,
    }))
    if (toAdd.length) await database.foods.bulkAdd(toAdd)

    // Hide built-in foods that were taken out of the list, but keep any the user has edited themselves.
    const removed = await database.foods.where('seedKey').anyOf(REMOVED_SEED_KEYS).toArray()
    for (const food of removed) {
      if (food.archived !== 1 && food.updatedAt === food.createdAt) {
        await database.foods.update(food.id!, { archived: 1, updatedAt: now })
      }
    }
    await database.meta.put({ key: 'seedVersion', value: SEED_VERSION })
  })
}

/** Adds the workout plan once. Never overwrites edits; runs again only if the plan was wiped (e.g. old backup restored). */
export async function ensureWorkoutSeeded(database: RepFuelDB = db): Promise<void> {
  await database.transaction('rw', database.exercises, database.plan, database.meta, async () => {
    if ((await database.meta.get('workoutSeed'))?.value && (await database.plan.count())) return
    if (!(await database.plan.count())) {
      const now = Date.now()
      await database.exercises.bulkPut(SEED_EXERCISES.map((e) => ({ ...e, updatedAt: now })))
      await database.plan.bulkPut(SEED_PLAN)
    }
    await database.meta.put({ key: 'workoutSeed', value: 1 })
  })
}
