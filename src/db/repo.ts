import { db } from './db'
import { DEFAULT_SETTINGS } from './defaults'
import type { DayType, Entry, Food, Settings } from './types'
import { scaleFood } from '../logic/macros'

/** All reads and writes the screens need. Screens never touch Dexie tables directly. */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings'))?.value ?? DEFAULT_SETTINGS
}

export async function saveSettings(value: Settings): Promise<void> {
  await db.settings.put({ key: 'settings', value })
}

export async function logFood(date: string, food: Food, amount: number): Promise<number> {
  return (await db.entries.add({
    date,
    foodId: food.id,
    name: food.name,
    amount,
    unit: food.unit,
    estimate: food.estimate,
    createdAt: Date.now(),
    ...scaleFood(food, amount),
  }))!
}

export async function logQuick(date: string, item: Omit<Entry, 'id' | 'date' | 'createdAt'>): Promise<number> {
  return (await db.entries.add({ ...item, date, createdAt: Date.now() }))!
}

/** Changes the amount of a logged item and rescales its macros from the stored snapshot. */
export async function updateEntryAmount(id: number, amount: number): Promise<void> {
  const e = await db.entries.get(id)
  if (!e || e.amount <= 0 || amount <= 0) return
  const r = amount / e.amount
  const round = (n: number) => Math.round(n * r * 10) / 10
  await db.entries.update(id, { amount, kcal: round(e.kcal), protein: round(e.protein), carbs: round(e.carbs), fat: round(e.fat) })
}

export async function deleteEntry(id: number): Promise<void> {
  await db.entries.delete(id)
}

/** Copies every item logged on `from` into `to`. Returns how many were copied. */
export async function copyDay(from: string, to: string): Promise<number> {
  const src = await db.entries.where('date').equals(from).sortBy('createdAt')
  const now = Date.now()
  await db.entries.bulkAdd(src.map(({ id: _id, ...e }, i) => ({ ...e, date: to, createdAt: now + i })))
  return src.length
}

export async function setDayType(date: string, type: DayType, defaultType: DayType): Promise<void> {
  if (type === defaultType) await db.days.delete(date)
  else await db.days.put({ date, type })
}

export async function saveFood(food: Omit<Food, 'createdAt' | 'updatedAt'> & Partial<Pick<Food, 'createdAt'>>): Promise<number> {
  const now = Date.now()
  if (food.id) {
    await db.foods.update(food.id, { ...food, updatedAt: now })
    return food.id
  }
  return (await db.foods.add({ ...food, archived: 0, createdAt: now, updatedAt: now }))!
}

/** Soft delete: past log entries keep their snapshot and the built-in list won't re-add it. */
export async function archiveFood(id: number): Promise<void> {
  await db.foods.update(id, { archived: 1, updatedAt: Date.now() })
}

export async function logWeight(date: string, kg: number): Promise<void> {
  await db.weights.put({ date, kg })
}

export async function deleteWeight(date: string): Promise<void> {
  await db.weights.delete(date)
}
