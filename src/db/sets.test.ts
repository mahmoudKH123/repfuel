import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from './db'
import { setSetsDone, toggleExerciseDone } from './repo'

describe('set tracking sessions', () => {
  it('ticks the exercise when all sets are done and un-ticks when one is taken back', async () => {
    const all = ['a', 'b']
    expect(await setSetsDone('2026-11-16', 'push', 'a', 2, 3, all)).toBe(false)
    let s = await db.sessions.get('2026-11-16')
    expect(s?.sets).toEqual({ a: 2 })
    expect(s?.done).toEqual([])
    await setSetsDone('2026-11-16', 'push', 'a', 3, 3, all)
    expect((await db.sessions.get('2026-11-16'))?.done).toEqual(['a'])
    expect(await setSetsDone('2026-11-16', 'push', 'b', 4, 4, all)).toBe(true)
    await setSetsDone('2026-11-16', 'push', 'a', 1, 3, all)
    s = await db.sessions.get('2026-11-16')
    expect(s?.done).toEqual(['b'])
    expect(s?.finishedAt).toBeUndefined()
  })
  it('clears the set count when the exercise is un-checked', async () => {
    await setSetsDone('2026-11-17', 'pull', 'a', 3, 3, ['a', 'b'])
    await toggleExerciseDone('2026-11-17', 'pull', 'a', ['a', 'b'])
    const s = await db.sessions.get('2026-11-17')
    expect(s?.done).toEqual([])
    expect(s?.sets).toBeUndefined()
  })
})
