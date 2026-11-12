import { describe, expect, it } from 'vitest'
import { addDays, weekDays, weekStart } from './dates'
import { defaultAmount, kcalLooksWrong, scaleFood } from './macros'
import { summarizeDay, summarizeWeek } from './budget'
import { weeklyWeights } from './weight'
import { DEFAULT_SETTINGS } from '../db/defaults'
import type { Entry } from '../db/types'
import { SEED_FOODS } from '../db/seedFoods'

const e = (date: string, kcal: number, protein: number, carbs: number, fat: number): Entry => ({
  date, name: 'x', amount: 1, unit: 'serving', estimate: false, createdAt: 0, kcal, protein, carbs, fat,
})

describe('dates', () => {
  it('starts weeks on Saturday', () => {
    expect(weekStart('2026-11-12')).toBe('2026-11-07') // Thu → Sat
    expect(weekStart('2026-11-07')).toBe('2026-11-07') // Sat itself
    expect(weekStart('2026-11-13')).toBe('2026-11-07') // Fri ends the week
    expect(weekStart('2026-11-14')).toBe('2026-11-14') // next Sat
  })
  it('lists Sat→Fri', () => {
    const d = weekDays('2026-11-10')
    expect(d[0]).toBe('2026-11-07')
    expect(d[6]).toBe('2026-11-13')
  })
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('macros', () => {
  it('scales per-100g foods by grams', () => {
    const honey = { kcal: 304, protein: 0, carbs: 82, fat: 0, baseAmount: 100 }
    expect(scaleFood(honey, 20)).toEqual({ kcal: 60.8, protein: 0, carbs: 16.4, fat: 0 })
  })
  it('scales servings', () => {
    const toast = { kcal: 85, protein: 4.6, carbs: 14.2, fat: 1.1, baseAmount: 1 }
    expect(scaleFood(toast, 2)).toEqual({ kcal: 170, protein: 9.2, carbs: 28.4, fat: 2.2 })
  })
  it('scales olive oil sprays', () => {
    const spray = SEED_FOODS.find((f) => f.seedKey === 'olive-oil-spray')!
    expect(scaleFood(spray, 10)).toEqual({ kcal: 22, protein: 0, carbs: 0, fat: 2.5 })
  })
  it('prefills one serving or the base weight', () => {
    expect(defaultAmount({ unit: 'serving', baseAmount: 1 })).toBe(1)
    expect(defaultAmount({ unit: 'g', baseAmount: 150 })).toBe(150)
  })
  it('flags kcal that disagrees with macros', () => {
    expect(kcalLooksWrong({ kcal: 13, protein: 4.5, carbs: 11, fat: 1 })).toBe(true)
    expect(kcalLooksWrong({ kcal: 85, protein: 4.6, carbs: 14.2, fat: 1.1 })).toBe(false)
  })
})

describe('seed list', () => {
  it('has unique keys and valid numbers', () => {
    const keys = SEED_FOODS.map((f) => f.seedKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const f of SEED_FOODS) {
      expect(f.baseAmount).toBeGreaterThan(0)
      for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) expect(Number.isFinite(f[k])).toBe(true)
    }
  })
  it('only the reviewed item has mismatched kcal', () => {
    const off = SEED_FOODS.filter((f) => kcalLooksWrong(f)).map((f) => f.seedKey)
    expect(off.every((k) => SEED_FOODS.find((f) => f.seedKey === k)!.needsReview)).toBe(true)
  })
})

describe('budget', () => {
  it('uses training and rest targets with Sun and Fri as rest days', () => {
    expect(summarizeDay('2026-11-07', [], [], DEFAULT_SETTINGS).type).toBe('training') // Sat
    expect(summarizeDay('2026-11-08', [], [], DEFAULT_SETTINGS).type).toBe('rest') // Sun
    expect(summarizeDay('2026-11-13', [], [], DEFAULT_SETTINGS).type).toBe('rest') // Fri
  })

  it('matches the weekly pool from the tracking notes', () => {
    const w = summarizeWeek('2026-10-31', [], [], DEFAULT_SETTINGS, '2026-10-31')
    expect(w.pool).toEqual({ kcal: 16100, protein: 1050, carbs: 1965, fat: 450 })
  })

  it('reproduces week 7, day 1 remaining (Sat Oct 31)', () => {
    const w = summarizeWeek('2026-10-31', [e('2026-10-31', 2506, 163.2, 309.7, 76.1)], [], DEFAULT_SETTINGS, '2026-11-01')
    expect(w.left).toEqual({ kcal: 13594, protein: 886.8, carbs: 1655.3, fat: 373.9 })
  })

  it('switching a training day to rest shrinks the pool', () => {
    const w = summarizeWeek('2026-11-09', [], [{ date: '2026-11-09', type: 'rest' }], DEFAULT_SETTINGS, '2026-11-09')
    expect(w.pool.kcal).toBe(16100 - 2400 + 2050)
    expect(w.days.filter((d) => d.type === 'rest')).toHaveLength(3)
  })

  it('spreads what is left over the remaining days, today included', () => {
    const entries = [e('2026-11-07', 2000, 150, 250, 60), e('2026-11-12', 500, 30, 50, 20)]
    const w = summarizeWeek('2026-11-12', entries, [], DEFAULT_SETTINGS, '2026-11-12')
    expect(w.daysLeft).toBe(2) // Thu + Fri
    expect(w.perDayLeft!.kcal).toBe(Math.round((16100 - 2000) / 2))
  })

  it('flags fat over target', () => {
    expect(summarizeDay('2026-11-12', [e('2026-11-12', 900, 20, 10, 75)], [], DEFAULT_SETTINGS).fatOver).toBe(15)
  })

  it('has no per-day figure once the week is over', () => {
    expect(summarizeWeek('2026-11-07', [], [], DEFAULT_SETTINGS, '2026-11-20').perDayLeft).toBeNull()
  })
})

describe('weight', () => {
  it('averages weigh-ins per week against the reference', () => {
    const w = weeklyWeights([{ date: '2026-11-07', kg: 74.6 }, { date: '2026-11-10', kg: 75.0 }, { date: '2026-11-01', kg: 74.2 }], 74.5)
    expect(w[0]).toEqual({ weekStart: '2026-11-07', avgKg: 74.8, count: 2, vsReference: 0.3 })
    expect(w[1].weekStart).toBe('2026-10-31')
  })
})
