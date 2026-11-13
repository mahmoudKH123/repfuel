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
