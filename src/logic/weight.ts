import type { WeightLog } from '../db/types'
import { weekStart } from './dates'

export interface WeekWeight {
  weekStart: string
  avgKg: number
  count: number
  vsReference: number
}

/** Average weigh-ins per Sat→Fri week, newest first. */
export function weeklyWeights(logs: WeightLog[], referenceKg: number): WeekWeight[] {
  const groups = new Map<string, number[]>()
  for (const l of logs) {
    const k = weekStart(l.date)
    groups.set(k, [...(groups.get(k) ?? []), l.kg])
  }
  return [...groups.entries()]
    .map(([ws, kgs]) => {
      const avg = Math.round((kgs.reduce((a, b) => a + b, 0) / kgs.length) * 10) / 10
      return { weekStart: ws, avgKg: avg, count: kgs.length, vsReference: Math.round((avg - referenceKg) * 10) / 10 }
    })
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
}
