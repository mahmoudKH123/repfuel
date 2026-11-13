import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK, missedDays, mondayOf, newWeek, reshuffle } from './schedule'

const W = '2026-11-16' // a Monday
const plan = (over = {}) => ({ ...newWeek(W, W), ...over })
const count = (days: string[]) => days.filter((d) => d !== 'rest').length

describe('training week', () => {
  it('starts on Monday', () => {
    expect(mondayOf('2026-11-13')).toBe('2026-11-09') // Fri
    expect(mondayOf('2026-11-16')).toBe('2026-11-16')
    expect(mondayOf('2026-11-22')).toBe('2026-11-16') // Sun
  })
  it('default week is Push Pull Legs rest C&B Arms rest', () => expect(newWeek(W, W).days).toEqual(DEFAULT_WEEK))
  it('a week opened on Friday only owes Friday onwards', () => expect(newWeek(W, '2026-11-20').owed).toEqual(['chestback', 'arms']))

  it('skip Monday: all 5 still fit Tue–Sun, nothing dropped', () => {
    const r = reshuffle(plan({ blocked: [0] }), 0, new Map())
    expect(r.drop).toEqual([])
    expect(r.days[0]).toBe('rest')
    expect(count(r.days)).toBe(5)
    console.log('skip Mon ->', r.days.join(' '))
  })
  it('missed Pull on Tuesday: Pull moves later, done Monday stays', () => {
    const p = plan({ missed: [1] })
    const r = reshuffle(p, 2, new Map([[0, 'push']]))
    expect(r.days[0]).toBe('push')
    expect(r.days[1]).toBe('pull') // old label kept, shown crossed out
    expect(r.days.slice(2)).toContain('pull')
    expect(count(r.days.slice(2))).toBe(4) // Pull, Legs, C&B, Arms
    console.log('miss Tue ->', r.days.join(' '))
  })
  it('no room: offers to skip Legs only', () => {
    // Trained Mon, then off Tue–Thu; Fri–Sun left for Pull, Legs, C&B, Arms.
    const r = reshuffle(plan({ blocked: [] }), 4, new Map([[0, 'push']]))
    expect(r.drop).toEqual(['legs'])
    expect(r.days.slice(4).filter((d) => d !== 'rest').sort()).toEqual(['arms', 'chestback', 'pull'])
    console.log('no room ->', r.days.join(' '))
  })
  it('never schedules a dropped workout', () => {
    const r = reshuffle(plan({ dropped: ['legs'], blocked: [0] }), 0, new Map())
    expect(r.days).not.toContain('legs')
  })
  it('finds missed training days since the plan started', () => {
    expect(missedDays(plan(), 3, new Map([[0, 'push']]))).toEqual([1, 2])
    expect(missedDays(newWeek(W, '2026-11-18'), 3, new Map())).toEqual([2])
  })
})
