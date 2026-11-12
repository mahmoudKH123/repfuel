/** Dates are stored as local-time strings (YYYY-MM-DD) so a day never shifts with time zones. */

const pad = (n: number) => String(n).padStart(2, '0')

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(now: Date = new Date()): string {
  return toKey(now)
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function weekday(key: string): number {
  return fromKey(key).getDay()
}

/** Weeks run Saturday → Friday. */
export const WEEK_START_DAY = 6

export function weekStart(key: string): string {
  return addDays(key, -((weekday(key) - WEEK_START_DAY + 7) % 7))
}

export function weekDays(key: string): string[] {
  const start = weekStart(key)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatDay(key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return fromKey(key).toLocaleDateString('en-GB', opts)
}
