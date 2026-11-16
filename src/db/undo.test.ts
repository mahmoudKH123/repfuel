import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepFuelDB } from './db'
import { canUndo, clearUndo, recordUndo, undoEvent, undoLast, undoable } from './undo'

let n = 0
let d: RepFuelDB
beforeEach(() => { d = new RepFuelDB(`undo-${n++}`); clearUndo() })

const entry = { date: '2026-11-17', name: 'Eggs', amount: 2, unit: 'serving' as const, estimate: false, createdAt: 1, kcal: 140, protein: 12, carbs: 1, fat: 10 }

describe('undo', () => {
  it('takes back an add (row with a new auto id is removed)', async () => {
    await undoable('Added Eggs', () => d.entries.add({ ...entry }))
    expect(await d.entries.count()).toBe(1)
    expect(undoEvent()?.step.label).toBe('Added Eggs')
    expect(await undoLast()).toBe(true)
    expect(await d.entries.count()).toBe(0)
    expect(canUndo()).toBe(false)
  })

  it('puts back the old values of an update and a put', async () => {
    const id = await d.entries.add({ ...entry })
    await undoable('Eggs 2 → 3', () => d.entries.update(id, { amount: 3, kcal: 210 }))
    expect((await d.entries.get(id))?.amount).toBe(3)
    await undoLast()
    expect(await d.entries.get(id)).toMatchObject({ amount: 2, kcal: 140 })

    await d.weights.put({ date: '2026-11-17', kg: 80 })
    await undoable('Weigh-in', () => d.weights.put({ date: '2026-11-17', kg: 81 }))
    await undoLast()
    expect((await d.weights.get('2026-11-17'))?.kg).toBe(80)
  })

  it('brings back deleted rows', async () => {
    const id = await d.entries.add({ ...entry })
    await undoable('Removed Eggs', () => d.entries.delete(id))
    expect(await d.entries.get(id)).toBeUndefined()
    await undoLast()
    expect(await d.entries.get(id)).toMatchObject({ name: 'Eggs', amount: 2 })
  })

  it('restores a whole cleared table and removes rows added after', async () => {
    await d.weights.bulkPut([{ date: 'a', kg: 1 }, { date: 'b', kg: 2 }])
    await undoable('Restored backup', async () => { await d.weights.clear(); await d.weights.put({ date: 'c', kg: 3 }) })
    expect((await d.weights.toArray()).map((w) => w.date)).toEqual(['c'])
    await undoLast()
    expect((await d.weights.toArray()).map((w) => w.date)).toEqual(['a', 'b'])
  })

  it('keeps the first "before" when one action writes a row twice, across tables', async () => {
    await d.water.put({ date: 'x', ml: 0, sips: [] })
    await d.weights.clear()
    await undoable('Two writes', () => d.transaction('rw', d.water, d.weights, async () => {
      await d.water.put({ date: 'x', ml: 600, sips: [600] })
      await d.water.put({ date: 'x', ml: 1600, sips: [600, 1000] })
      await d.weights.put({ date: 'y', kg: 70 })
    }))
    await undoLast()
    expect(await d.water.get('x')).toMatchObject({ ml: 0, sips: [] })
    expect(await d.weights.get('y')).toBeUndefined()
  })

  it('does not make a step when nothing really changed (only the edit stamp)', async () => {
    await d.exercises.put({ id: 'bench', name: 'Bench', sets: 3, reps: 10, weight: 60, unit: 'kg', updatedAt: 1 })
    await undoable('Bench', () => d.exercises.put({ id: 'bench', name: 'Bench', sets: 3, reps: 10, weight: 60, unit: 'kg', updatedAt: 2 }))
    expect(canUndo()).toBe(false)
  })

  it('does not record writes made outside an undoable action', async () => {
    await d.entries.add({ ...entry })
    expect(canUndo()).toBe(false)
    expect(await undoLast()).toBe(false)
  })

  it('only keeps the last change', async () => {
    const id = await d.entries.add({ ...entry })
    await undoable('First', () => d.entries.update(id, { amount: 3 }))
    await undoable('Second', () => d.entries.update(id, { amount: 4 }))
    await undoLast()
    expect((await d.entries.get(id))?.amount).toBe(3)
    expect(await undoLast()).toBe(false)
  })

  it('skips the step when the label function returns null, and runs onUndo after rows are back', async () => {
    await undoable(() => null, () => d.entries.add({ ...entry }))
    expect(canUndo()).toBe(false)
    let ran = false
    await undoable('With extra', () => d.entries.add({ ...entry }), { onUndo: () => { ran = true } })
    await undoLast()
    expect(ran).toBe(true)
  })

  it('undoes a change outside the database', async () => {
    let theme = 'dark'
    theme = 'light'
    recordUndo('Look: Dark → Light', () => { theme = 'dark' })
    await undoLast()
    expect(theme).toBe('dark')
    expect(undoEvent()?.kind).toBe('undone')
  })
})
