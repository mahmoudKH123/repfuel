import type { DayOverride, DayType, Entry, Macros, Settings } from '../db/types'
import { sub, sum } from './macros'
import { weekDays, weekday } from './dates'

export function defaultDayType(date: string, settings: Settings): DayType {
  return settings.defaultRestDays.includes(weekday(date)) ? 'rest' : 'training'
}

export function dayType(date: string, overrides: DayOverride[], settings: Settings): DayType {
  return overrides.find((o) => o.date === date)?.type ?? defaultDayType(date, settings)
}

export interface DaySummary {
  date: string
  type: DayType
  target: Macros
  eaten: Macros
  left: Macros
  fatOver: number
}

export function summarizeDay(date: string, entries: Entry[], overrides: DayOverride[], settings: Settings): DaySummary {
  const type = dayType(date, overrides, settings)
  const target = settings.targets[type]
  const eaten = sum(entries.filter((e) => e.date === date))
  const left = sub(target, eaten)
  return { date, type, target, eaten, left, fatOver: Math.max(0, -left.fat) }
}

export interface WeekSummary {
  days: DaySummary[]
  /** Sum of each day's target, so swapping a day's type changes the pool. */
  pool: Macros
  eaten: Macros
  left: Macros
  /** Days from today to Friday, including today. 0 when the week is over. */
  daysLeft: number
  /** What's available per day for the rest of the week, counting today as not yet eaten. */
  perDayLeft: Macros | null
  fatOver: number
}

/** Weekly pooled budget, Saturday → Friday. Every entry subtracts from one running pool. */
export function summarizeWeek(anyDate: string, entries: Entry[], overrides: DayOverride[], settings: Settings, today: string): WeekSummary {
  const days = weekDays(anyDate).map((d) => summarizeDay(d, entries, overrides, settings))
  const pool = sum(days.map((d) => d.target))
  const eaten = sum(days.map((d) => d.eaten))
  const left = sub(pool, eaten)

  const remaining = days.filter((d) => d.date >= today)
  const daysLeft = remaining.length
  let perDayLeft: Macros | null = null
  if (daysLeft > 0) {
    const eatenBeforeToday = sum(days.filter((d) => d.date < today).map((d) => d.eaten))
    const avail = sub(pool, eatenBeforeToday)
    perDayLeft = {
      kcal: Math.round(avail.kcal / daysLeft),
      protein: Math.round((avail.protein / daysLeft) * 10) / 10,
      carbs: Math.round((avail.carbs / daysLeft) * 10) / 10,
      fat: Math.round((avail.fat / daysLeft) * 10) / 10,
    }
  }
  return { days, pool, eaten, left, daysLeft, perDayLeft, fatOver: Math.max(0, -left.fat) }
}
