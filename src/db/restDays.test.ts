import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, ensureSeeded } from './db'
import { getSettings, setRestDays } from './repo'
import { summarizeDay } from '../logic/budget'

describe('food rest days follow the training plan', () => {
  it('moves future rest days but keeps past days exactly as they were', async () => {
    await ensureSeeded()
    // Old default rest days: Friday + Sunday. Food was logged on Thursday 12 Nov, before the plan existed.
    await db.entries.add({ date: '2026-11-12', name: 'eggs', amount: 1, unit: 'serving', estimate: false, createdAt: 1, kcal: 140, protein: 12, carbs: 1, fat: 10 })
    await setRestDays([4, 0], '2026-11-14') // plan rests Thursday + Sunday
    const settings = await getSettings()
    const overrides = await db.days.toArray()
    const type = (d: string) => summarizeDay(d, [], overrides, settings).type
    expect(type('2026-11-12')).toBe('training') // past Thursday: unchanged
    expect(type('2026-11-13')).toBe('rest') // past Friday: unchanged
    expect(type('2026-11-19')).toBe('rest') // next Thursday: follows the plan
    expect(type('2026-11-20')).toBe('training') // next Friday: follows the plan
    expect(settings.defaultRestDays.sort()).toEqual([0, 4])
  })
})
