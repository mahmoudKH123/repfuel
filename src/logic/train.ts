import type { Attempt, Exercise } from '../db/types'

/** Suggested weight jump: the gap you used last time, else 5 (2.5 under 20). */
export function stepFor(e: Pick<Exercise, 'weight' | 'next'>): number {
  if (e.next && e.next.weight > e.weight) return e.next.weight - e.weight
  return e.weight < 20 ? 2.5 : 5
}

export type AttemptResult = { leveledUp: false; exercise: Exercise } | { leveledUp: true; from: number; exercise: Exercise }

/**
 * Records reps at the heavier weight. Hitting the target reps makes it your new working weight
 * and sets the next goal one step higher (not tried yet).
 */
export function recordAttempt(e: Exercise, reps: number, now = Date.now()): AttemptResult {
  if (!e.next) return { leveledUp: false, exercise: e }
  const target = e.reps || 1
  if (e.reps > 0 && reps >= target) {
    const step = stepFor(e)
    const weight = e.next.weight
    return { leveledUp: true, from: e.weight, exercise: { ...e, weight, next: { weight: weight + step, reps: 0 }, updatedAt: now } }
  }
  return { leveledUp: false, exercise: { ...e, next: { ...e.next, reps: Math.max(0, reps) }, updatedAt: now } }
}

/** Drops the heavier goal (changed your mind); the working weight stays as it is. */
export function cancelAttempt(e: Exercise, now = Date.now()): Exercise {
  return { ...e, next: undefined, updatedAt: now }
}

export function startAttempt(e: Exercise, now = Date.now()): Exercise {
  const next: Attempt = { weight: e.weight + stepFor(e), reps: 0 }
  return { ...e, next, updatedAt: now }
}

const LB = 0.4536

/** Total kg moved: sets × reps × weight (to-failure sets are left out). */
export function volumeKg(list: Exercise[]): number {
  return Math.round(list.reduce((t, e) => t + e.sets * e.reps * e.weight * (e.unit === 'lbs' ? LB : 1), 0))
}

export const fmtWeight = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * Sets the working weight and the next-goal weight from the weight dial.
 * A changed goal weight is a new attempt (reps back to 0); a goal at or under
 * the working weight is moved one step above it.
 */
export function applyWeights(e: Exercise, weight: number, nextWeight: number | undefined, now = Date.now()): Exercise {
  let next = e.next
  if (nextWeight !== undefined) next = nextWeight === e.next?.weight ? e.next : { weight: nextWeight, reps: 0 }
  if (next && next.weight <= weight) next = { weight: weight + stepFor({ weight }), reps: 0 }
  return { ...e, weight, next, updatedAt: now }
}

export const DEFAULT_REST = 90

/** Rest between sets: the lift's own time, else the default from Settings, else 90 s. */
export function restFor(e: Pick<Exercise, 'restSec'>, defaultSec?: number): number {
  return e.restSec ?? defaultSec ?? DEFAULT_REST
}

/**
 * Tapping set dot `tapped` (0-based): a dot after the ones done ticks up to and including it;
 * a dot that's already done un-ticks it and every set after it.
 */
export function tapSet(done: number, tapped: number, sets: number): number {
  const t = Math.min(Math.max(0, tapped), sets - 1)
  return t < done ? t : t + 1
}

/** Seconds left on a rest that ends at `endsAt` (ms), never below 0. */
export const restLeft = (endsAt: number, now = Date.now()) => Math.max(0, Math.ceil((endsAt - now) / 1000))

export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** Short words for what changed on an exercise, for the undo pill: "Bench 60 → 62.5 kg", "Bench 3 → 4 sets". */
export function describeChange(a: Exercise, b: Exercise): string {
  const u = b.unit
  if (a.name !== b.name) return `${a.name} → ${b.name}`
  const parts: string[] = []
  if (a.weight !== b.weight) parts.push(`${fmtWeight(a.weight)} → ${fmtWeight(b.weight)} ${u}`)
  if (a.sets !== b.sets) parts.push(`${a.sets} → ${b.sets} sets`)
  if (a.reps !== b.reps) parts.push(`${a.reps || 'fail'} → ${b.reps || 'fail'} reps`)
  if (parts.length) return `${b.name} ${parts.join(', ')}`
  if (!a.next && b.next) return `${b.name}: try ${fmtWeight(b.next.weight)} ${u}`
  if (a.next && !b.next) return `${b.name}: heavier goal cancelled`
  if (a.next && b.next && a.next.weight !== b.next.weight) return `${b.name} goal ${fmtWeight(a.next.weight)} → ${fmtWeight(b.next.weight)} ${u}`
  if (a.next && b.next && a.next.reps !== b.next.reps) return `${b.name} ${fmtWeight(b.next.weight)} ${u}: ${a.next.reps} → ${b.next.reps} reps`
  if (a.restSec !== b.restSec) return `${b.name} rest time`
  return `Edited ${b.name}`
}
