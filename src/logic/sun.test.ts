import { describe, expect, it } from 'vitest'
import { greetingFor, skyAt, sunTimes } from './sun'

// Minutes after UTC midnight, so the test does not depend on the machine's time zone.
const utcMin = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes()

describe('sun', () => {
  it('matches published Cairo sunrise/sunset within a few minutes', () => {
    // 14 Nov: about 06:15 / 16:59 Cairo time (UTC+2) -> 04:15 / 14:59 UTC
    const nov = sunTimes(new Date(2026, 10, 14))!
    expect(Math.abs(utcMin(nov.rise) - (4 * 60 + 15))).toBeLessThanOrEqual(5)
    expect(Math.abs(utcMin(nov.set) - (14 * 60 + 59))).toBeLessThanOrEqual(5)
    // 21 Jun: about 05:54 / 19:59 local (UTC+3) -> 02:54 / 16:59 UTC
    const jun = sunTimes(new Date(2026, 5, 21))!
    expect(Math.abs(utcMin(jun.rise) - (2 * 60 + 54))).toBeLessThanOrEqual(6)
    expect(Math.abs(utcMin(jun.set) - (16 * 60 + 59))).toBeLessThanOrEqual(6)
  })

  it('places the sun by day and the moon by night', () => {
    const { rise, set } = sunTimes(new Date(2026, 10, 14))!
    const noon = new Date((rise.getTime() + set.getTime()) / 2)
    expect(skyAt(noon)).toMatchObject({ night: false, phase: 'day' })
    expect(skyAt(noon).t).toBeCloseTo(0.5, 2)
    expect(skyAt(new Date(rise.getTime() + 20 * 60_000)).phase).toBe('dawn')
    expect(skyAt(new Date(set.getTime() - 60 * 60_000)).phase).toBe('golden')
    expect(skyAt(new Date(set.getTime() + 30 * 60_000))).toMatchObject({ night: true, phase: 'dusk' })
    const lateNight = skyAt(new Date(rise.getTime() - 4 * 3_600_000))
    expect(lateNight).toMatchObject({ night: true, phase: 'night' })
    expect(lateNight.t).toBeGreaterThan(0.5)
    expect(lateNight.t).toBeLessThan(1)
  })

  it('picks the greeting word', () => {
    expect(greetingFor(7)).toBe('Good morning')
    expect(greetingFor(13)).toBe('Good afternoon')
    expect(greetingFor(20)).toBe('Good evening')
    expect(greetingFor(2)).toBe('Up late')
  })
})
