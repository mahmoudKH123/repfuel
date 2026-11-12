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
