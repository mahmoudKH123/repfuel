import { describe, expect, it } from 'vitest'
import { applyWeights, cancelAttempt, recordAttempt, startAttempt, volumeKg } from './train'
import type { Exercise } from '../db/types'

const ex: Exercise = { id: 'sp', name: 'Shoulder Press', sets: 3, reps: 10, weight: 55, unit: 'kg', next: { weight: 60, reps: 8 }, updatedAt: 0 }

describe('progressive overload', () => {
  it('logs reps under target', () => {
    const r = recordAttempt(ex, 9)
    expect(r.leveledUp).toBe(false)
    expect(r.exercise.next).toEqual({ weight: 60, reps: 9 })
    expect(r.exercise.weight).toBe(55)
  })
  it('levels up at target reps and sets the next goal', () => {
    const r = recordAttempt(ex, 10)
    expect(r.leveledUp).toBe(true)
    expect(r.exercise.weight).toBe(60)
    expect(r.exercise.next).toEqual({ weight: 65, reps: 0 })
  })
  it('starts a heavier attempt', () => {
    expect(startAttempt({ ...ex, next: undefined }).next).toEqual({ weight: 60, reps: 0 })
    expect(startAttempt({ ...ex, weight: 15, next: undefined }).next).toEqual({ weight: 17.5, reps: 0 })
  })
  it('cancels a heavier attempt and keeps the working weight', () => {
    const c = cancelAttempt({ ...ex, next: { weight: 60, reps: 4 } })
    expect(c.next).toBeUndefined()
    expect(c.weight).toBe(ex.weight)
    expect(startAttempt(c).next).toEqual({ weight: ex.weight + 5, reps: 0 })
  })
  it('counts volume in kg', () => {
    expect(volumeKg([ex])).toBe(1650)
    expect(volumeKg([{ ...ex, reps: 0 }])).toBe(0)
  })
})

describe('weight dial', () => {
  it('levels down and keeps the goal', () => {
    const r = applyWeights(ex, 50, 60)
    expect(r.weight).toBe(50)
    expect(r.next).toEqual({ weight: 60, reps: 8 })
  })
  it('a new goal weight starts at 0 reps', () => expect(applyWeights(ex, 55, 62.5).next).toEqual({ weight: 62.5, reps: 0 }))
  it('pushes the goal above the working weight', () => expect(applyWeights(ex, 60, 60).next).toEqual({ weight: 65, reps: 0 }))
  it('leaves exercises with no goal alone', () => expect(applyWeights({ ...ex, next: undefined }, 57.5, undefined).next).toBeUndefined())
})
