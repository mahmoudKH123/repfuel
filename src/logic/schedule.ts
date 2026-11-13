import type { WeekPlan } from '../db/types'
import { addDays, fromKey } from './dates'

/** Monday-to-Sunday training week. */
export const DEFAULT_WEEK = ['push', 'pull', 'legs', 'rest', 'chestback', 'arms', 'rest']
export const WORKOUT_ORDER = ['push', 'pull', 'legs', 'chestback', 'arms']
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** If the week can't fit everything, Legs is the one offered for skipping (user's rule). */
const DROP_ORDER = ['legs', 'arms', 'chestback', 'pull', 'push']

/** How much two workouts hit the same muscles (higher = worse back to back). */
const OVERLAP: Record<string, number> = {
  'push|chestback': 2, // chest
  'push|arms': 2, // shoulders, triceps
  'pull|chestback': 2, // back
  'pull|arms': 2, // biceps, rear delts
  'chestback|arms': 1, // forearms
  'push|pull': 1, // forearms
}
const overlap = (a: string, b: string) => OVERLAP[`${a}|${b}`] ?? OVERLAP[`${b}|${a}`] ?? 0
const isWorkout = (d: string) => d !== 'rest'

export function mondayOf(key: string): string {
  return addDays(key, -((fromKey(key).getDay() + 6) % 7))
}
export const dayIndex = (week: string, date: string) => Math.round((fromKey(date).getTime() - fromKey(week).getTime()) / 86_400_000)

export function newWeek(week: string, startedOn: string, base: string[] = DEFAULT_WEEK): WeekPlan {
  const start = Math.max(0, dayIndex(week, startedOn))
  return {
    week, startedOn, days: [...base],
    owed: base.filter((d, i) => isWorkout(d) && i >= start),
    dropped: [], blocked: [], missed: [],
  }
}

/** Lower is better: muscle overlap on back-to-back days, long streaks, moving things far, breaking the usual order. */
function score(days: string[], original: string[]): number {
  let s = 0
  let streak = 0
  for (let i = 0; i < 7; i++) {
    if (isWorkout(days[i])) {
      streak++
      if (streak > 3) s += 15
      if (i > 0 && isWorkout(days[i - 1])) s += overlap(days[i - 1], days[i]) * 10
    } else streak = 0
  }
  const seq = days.filter(isWorkout)
  for (let a = 0; a < seq.length; a++) for (let b = a + 1; b < seq.length; b++) {
    if (WORKOUT_ORDER.indexOf(seq[a]) > WORKOUT_ORDER.indexOf(seq[b])) s += 1
  }
  days.forEach((d, i) => {
    if (!isWorkout(d)) return
    const was = original.indexOf(d)
    if (was >= 0) s += Math.abs(was - i) * 0.5
  })
  return s
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
}
function combinations(xs: number[], k: number): number[][] {
  if (k === 0) return [[]]
  if (xs.length < k) return []
  const [h, ...t] = xs
  return [...combinations(t, k - 1).map((c) => [h, ...c]), ...combinations(t, k)]
}

export interface Reshuffle {
  days: string[]
  /** Workouts that don't fit before Sunday; must be confirmed before applying. */
  drop: string[]
  /** What moved, for the toast, e.g. [{ id: 'pull', to: 3 }]. */
  moved: { id: string; to: number }[]
}

/**
 * Fits every workout still owed this week into the open days from `from` (today, or tomorrow if today is trained)
 * to Sunday, never touching next week. Days before `from` keep what was trained there (or rest).
 */
export function reshuffle(plan: WeekPlan, from: number, trained: Map<number, string>): Reshuffle {
  const done = new Set(trained.values())
  // Past days keep their label (shown faded / crossed out); for scoring, only what was trained counts.
  const past = plan.days.map((d, i) => (i < from ? (trained.get(i) ?? d) : null))
  const pastForScore = plan.days.map((_, i) => (i < from ? (trained.get(i) ?? 'rest') : 'rest'))
  const remaining = plan.owed.filter((w) => !done.has(w) && !plan.dropped.includes(w))
  const open: number[] = []
  for (let i = from; i < 7; i++) if (!plan.blocked.includes(i)) open.push(i)

  const drop: string[] = []
  const keep = [...remaining]
  for (const w of DROP_ORDER) {
    if (keep.length <= open.length) break
    const at = keep.indexOf(w)
    if (at >= 0) { keep.splice(at, 1); drop.push(w) }
  }

  let bestSlots: number[] = []
  let bestOrder: string[] = []
  let bestScore = Infinity
  for (const slots of combinations(open, keep.length)) {
    for (const order of permutations(keep)) {
      const trial = [...pastForScore]
      slots.forEach((slot, k) => { trial[slot] = order[k] })
      const sc = score(trial, plan.days)
      if (sc < bestScore) { bestScore = sc; bestSlots = slots; bestOrder = order }
    }
  }
  const days = past.map((d) => d ?? 'rest')
  bestSlots.forEach((slot, k) => { days[slot] = bestOrder[k] })
  const moved = days.flatMap((d, i) => (isWorkout(d) && plan.days[i] !== d && i >= from ? [{ id: d, to: i }] : []))
  return { days, drop, moved }
}

/** Training days before today (since the plan started) where nothing was ticked. */
export function missedDays(plan: WeekPlan, todayIdx: number, trained: Map<number, string>): number[] {
  const start = Math.max(0, dayIndex(plan.week, plan.startedOn))
  const out: number[] = []
  for (let i = start; i < Math.min(todayIdx, 7); i++) {
    if (isWorkout(plan.days[i]) && !trained.has(i) && !plan.missed.includes(i)) out.push(i)
  }
  return out
}

/** Where a workout sits from day `from` on (past days can still carry its old label). */
export const findFrom = (days: string[], id: string, from: number) => days.findIndex((d, i) => i >= from && d === id)

/** JS weekday numbers (0 = Sunday) of the rest days in a Mon..Sun week. */
export const restWeekdays = (days: string[]) => days.flatMap((d, i) => (d === 'rest' ? [(i + 1) % 7] : []))
