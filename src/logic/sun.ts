/** New Cairo. The greeting's sun arc uses real sunrise/sunset for here (no location permission needed). */
export const HOME = { lat: 30.03, lon: 31.47 }

const rad = Math.PI / 180

/**
 * Sunrise and sunset for the local calendar day of `date` (NOAA approximation, about ±2 min).
 * Returns null on days without both (polar), which never happens in Cairo but keeps the maths honest.
 */
export function sunTimes(date: Date, lat = HOME.lat, lon = HOME.lon): { rise: Date; set: Date } | null {
  const start = new Date(date.getFullYear(), 0, 1)
  const n = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime()) / 86_400_000) + 1
  const g = ((2 * Math.PI) / 365) * (n - 1)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)
  if (cosH < -1 || cosH > 1) return null
  const h = Math.acos(cosH) / rad
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const at = (min: number) => new Date(utcMidnight + min * 60_000)
  return { rise: at(720 - 4 * (lon + h) - eq), set: at(720 - 4 * (lon - h) - eq) }
}

export type SkyPhase = 'dawn' | 'day' | 'golden' | 'dusk' | 'night'

export interface Sky {
  phase: SkyPhase
  /** Sun (day) or moon (night) position along the arc, 0 = left horizon, 1 = right horizon. */
  t: number
  night: boolean
  rise: Date
  set: Date
}

const H = 3_600_000

/** Where the sun (or moon) sits right now, and what light it is. */
export function skyAt(now: Date, lat = HOME.lat, lon = HOME.lon): Sky {
  const today = sunTimes(now, lat, lon)
  // Fallback for polar days: a plain 6:00-18:00 day.
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rise = today?.rise ?? new Date(d0.getTime() + 6 * H)
  const set = today?.set ?? new Date(d0.getTime() + 18 * H)
  const ms = now.getTime()
  if (ms >= rise.getTime() && ms <= set.getTime()) {
    const t = (ms - rise.getTime()) / (set.getTime() - rise.getTime())
    const phase: SkyPhase = ms - rise.getTime() < H ? 'dawn' : set.getTime() - ms < 1.5 * H ? 'golden' : 'day'
    return { phase, t, night: false, rise, set }
  }
  // Night runs from last sunset to next sunrise; the moon crosses the arc over it.
  const prevSet = ms < rise.getTime() ? (sunTimes(new Date(d0.getTime() - 12 * H), lat, lon)?.set ?? new Date(set.getTime() - 24 * H)) : set
  const nextRise = ms < rise.getTime() ? rise : (sunTimes(new Date(d0.getTime() + 36 * H), lat, lon)?.rise ?? new Date(rise.getTime() + 24 * H))
  const t = (ms - prevSet.getTime()) / (nextRise.getTime() - prevSet.getTime())
  const phase: SkyPhase = ms - prevSet.getTime() < H ? 'dusk' : nextRise.getTime() - ms < H ? 'dawn' : 'night'
  return { phase, t: Math.max(0, Math.min(1, t)), night: true, rise, set }
}

/** The greeting word for the hour. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 24) return 'Good evening'
  return 'Up late'
}
