import { describe, expect, it } from 'vitest'
import { applyWeights, cancelAttempt, describeChange, fmtClock, recordAttempt, restFor, restLeft, startAttempt, tapSet, volumeKg } from './train'
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

describe('set tracking', () => {
  it('ticks up to the tapped set, un-ticks from a done one', () => {
    expect(tapSet(0, 0, 3)).toBe(1)
    expect(tapSet(1, 2, 3)).toBe(3)
    expect(tapSet(3, 2, 3)).toBe(2)
    expect(tapSet(2, 0, 3)).toBe(0)
    expect(tapSet(0, 9, 3)).toBe(3)
  })
  it('uses the lift rest, then the default, then 90 s', () => {
    expect(restFor({ restSec: 120 }, 60)).toBe(120)
    expect(restFor({}, 60)).toBe(60)
    expect(restFor({})).toBe(90)
  })
  it('counts rest down in whole seconds and formats it', () => {
    expect(restLeft(10_500, 10_000)).toBe(1)
    expect(restLeft(9_000, 10_000)).toBe(0)
    expect(fmtClock(95)).toBe('1:35')
    expect(fmtClock(5)).toBe('0:05')
  })
})

describe('undo labels', () => {
  const e: Exercise = { id: 'b', name: 'Bench', sets: 3, reps: 10, weight: 60, unit: 'kg', updatedAt: 0 }
  it('says what changed', () => {
    expect(describeChange(e, { ...e, weight: 62.5 })).toBe('Bench 60 → 62.5 kg')
    expect(describeChange(e, { ...e, sets: 4, reps: 8 })).toBe('Bench 3 → 4 sets, 10 → 8 reps')
    expect(describeChange(e, { ...e, name: 'Flat Bench' })).toBe('Bench → Flat Bench')
    expect(describeChange(e, { ...e, next: { weight: 65, reps: 0 } })).toBe('Bench: try 65 kg')
    expect(describeChange({ ...e, next: { weight: 65, reps: 4 } }, e)).toBe('Bench: heavier goal cancelled')
    expect(describeChange({ ...e, next: { weight: 65, reps: 4 } }, { ...e, next: { weight: 65, reps: 5 } })).toBe('Bench 65 kg: 4 → 5 reps')
    expect(describeChange(e, { ...e })).toBe('Edited Bench')
  })
})
