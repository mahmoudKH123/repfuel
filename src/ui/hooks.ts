import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_SETTINGS } from '../db/defaults'
import type { Settings } from '../db/types'
import { weekDays } from '../logic/dates'
import { summarizeWeek, type WeekSummary } from '../logic/budget'

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('settings'), [])?.value ?? DEFAULT_SETTINGS
}

/** Live weekly summary for the Sat→Fri week containing `date`. Re-renders whenever data changes. */
export function useWeek(date: string, today: string): WeekSummary | undefined {
  const settings = useSettings()
  const days = weekDays(date)
  const data = useLiveQuery(async () => {
    const [entries, overrides] = await Promise.all([
      db.entries.where('date').between(days[0], days[6], true, true).toArray(),
      db.days.where('date').between(days[0], days[6], true, true).toArray(),
    ])
    return { entries, overrides }
  }, [days[0]])
  return data ? summarizeWeek(date, data.entries, data.overrides, settings, today) : undefined
}

/** Re-reads the time every minute so the hello and its colour follow the time of day. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    const vis = () => setNow(new Date())
    document.addEventListener('visibilitychange', vis)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return now
}
