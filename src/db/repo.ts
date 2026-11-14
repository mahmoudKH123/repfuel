import { db } from './db'
import { DEFAULT_SETTINGS } from './defaults'
import type { DayType, Entry, Exercise, Food, Settings, WeekPlan } from './types'
import { defaultDayType } from '../logic/budget'
import { addDays, weekStart } from '../logic/dates'
import { DEFAULT_WEEK, dayIndex, mondayOf, newWeek, restWeekdays } from '../logic/schedule'
import { scaleFood } from '../logic/macros'

/** All reads and writes the screens need. Screens never touch Dexie tables directly. */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings'))?.value ?? DEFAULT_SETTINGS
}

export async function saveSettings(value: Settings): Promise<void> {
  await db.settings.put({ key: 'settings', value })
}

/**
 * Changes which weekdays are food rest days. Any past day that would flip (no override of its own) keeps its old type,
 * so targets you already logged against never change. This week's plan is re-applied so today and later follow it.
 */
export async function setRestDays(rest: number[], today: string): Promise<Settings> {
  const s = await getSettings()
  const old = s.defaultRestDays
  if (old.length === rest.length && old.every((d) => rest.includes(d))) return s
  const next = { ...s, defaultRestDays: rest }
  const first = await db.entries.orderBy('date').first()
  await db.transaction('rw', db.days, db.settings, async () => {
    if (first) {
      const pinned = new Set((await db.days.toArray()).map((d) => d.date))
      for (let d = weekStart(first.date); d < today; d = addDays(d, 1)) {
        const was = defaultDayType(d, s)
        if (!pinned.has(d) && was !== defaultDayType(d, next)) await db.days.put({ date: d, type: was })
      }
    }
    await db.settings.put({ key: 'settings', value: next })
  })
  const plan = await db.weeks.get(mondayOf(today))
  if (plan) await saveWeek(plan, today)
  return next
}

/** Startup: food rest days always follow the training plan's normal week (also fixes installs from before the plan existed). */
export async function syncRestDays(today: string): Promise<void> {
  const s = await getSettings()
  await setRestDays(restWeekdays(s.trainingWeek ?? DEFAULT_WEEK), today)
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

/** Puts a deleted item back exactly as it was (same id, time and numbers). Used by Undo. */
export async function restoreEntry(e: Entry): Promise<void> {
  await db.entries.put(e)
}

/** Moves a logged item to another part of the day by changing its time (the day itself stays). */
export async function updateEntryTime(id: number, createdAt: number): Promise<void> {
  await db.entries.update(id, { createdAt })
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

/* ---------- Training ---------- */

export async function saveExercise(e: Exercise): Promise<void> {
  await db.exercises.put({ ...e, updatedAt: Date.now() })
}

/** Ticks or unticks an exercise for today; marks the day finished when every exercise is done. */
export async function toggleExerciseDone(date: string, dayId: string, exerciseId: string, all: string[]): Promise<boolean> {
  return db.transaction('rw', db.sessions, async () => {
    const s = (await db.sessions.get(date)) ?? { date, dayId, done: [] }
    const set = new Set(s.dayId === dayId ? s.done : [])
    if (set.has(exerciseId)) set.delete(exerciseId)
    else set.add(exerciseId)
    const done = all.filter((id) => set.has(id))
    const finished = all.length > 0 && done.length === all.length
    const was = s.dayId === dayId ? s.finishedAt : undefined
    await db.sessions.put({ date, dayId, done, finishedAt: finished ? (was ?? Date.now()) : undefined })
    return finished && !was
  })
}

/** This week's schedule, created from the default week the first time it's opened. */
export async function ensureWeek(week: string, today: string): Promise<WeekPlan> {
  const have = await db.weeks.get(week)
  if (have) return have
  const plan = newWeek(week, today, (await getSettings()).trainingWeek)
  await saveWeek(plan, today)
  return plan
}

/**
 * Saves the week and makes Today/Week calorie targets follow it: rest in the plan = rest-day targets.
 * Only today and later are touched, so past days keep the targets they were logged against.
 */
export async function saveWeek(plan: WeekPlan, today: string): Promise<void> {
  const settings = await getSettings()
  await db.transaction('rw', db.weeks, db.days, async () => {
    await db.weeks.put(plan)
    for (let i = 0; i < 7; i++) {
      const date = addDays(plan.week, i)
      if (date < today) continue
      await setDayType(date, plan.days[i] === 'rest' ? 'rest' : 'training', defaultDayType(date, settings))
    }
  })
}

export async function addExerciseToDay(dayId: string, e: Exercise): Promise<void> {
  await db.transaction('rw', db.exercises, db.plan, async () => {
    await db.exercises.put({ ...e, updatedAt: Date.now() })
    const day = await db.plan.get(dayId)
    if (day && !day.exerciseIds.includes(e.id)) await db.plan.update(dayId, { exerciseIds: [...day.exerciseIds, e.id] })
  })
}

/** Removes an exercise from one day only; the lift and its progress stay for other days. */
export async function removeExerciseFromDay(dayId: string, exerciseId: string): Promise<void> {
  const day = await db.plan.get(dayId)
  if (day) await db.plan.update(dayId, { exerciseIds: day.exerciseIds.filter((id) => id !== exerciseId) })
}

/**
 * Saves your normal Mon–Sun week. Food rest days follow its rest days.
 * With `thisWeek`, today and the rest of this week switch to it too (days already trained stay).
 */
export async function saveTrainingWeek(days: string[], thisWeek: boolean, today: string): Promise<void> {
  const settings = await setRestDays(restWeekdays(days), today)
  await saveSettings({ ...settings, trainingWeek: days })
  if (!thisWeek) return
  const week = mondayOf(today)
  const plan = await ensureWeek(week, today)
  const ti = dayIndex(week, today)
  const trained = new Set((await db.sessions.where('date').between(week, today, true, true).toArray()).filter((x) => x.done.length).map((x) => dayIndex(week, x.date)))
  const next = plan.days.map((d, i) => (i < ti || trained.has(i) ? d : days[i]))
  const start = Math.max(0, dayIndex(week, plan.startedOn))
  await saveWeek({ ...plan, days: next, owed: days.filter((d, i) => d !== 'rest' && i >= start), blocked: [], dropped: [], missed: plan.missed.filter((i) => i < ti), declined: false }, today)
}

/** Sets the order of a day's exercises. */
export async function reorderDay(id: string, exerciseIds: string[]): Promise<void> {
  await db.plan.update(id, { exerciseIds })
}

export async function renamePlanDay(id: string, name: string, short: string): Promise<void> {
  await db.plan.update(id, { name, short })
}
