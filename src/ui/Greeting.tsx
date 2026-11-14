import { useEffect, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { dayIndex, mondayOf } from '../logic/schedule'
import { greetingFor, skyAt } from '../logic/sun'
import { useWeek } from './hooks'
import { Logo } from './Logo'

const k = (v: number) => Math.round(v).toLocaleString('en-US')

/** Re-reads the time every minute so the hello and its colour follow the time of day. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    const vis = () => setNow(new Date())
    document.addEventListener('visibilitychange', vis)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return now
}

/** One useful line from today's data: the workout (or rest) and the calories that are left. */
function useLine(today: string): string {
  const week = useWeek(today, today)
  const monday = mondayOf(today)
  const plan = useLiveQuery(() => db.weeks.get(monday), [monday])
  const days = useLiveQuery(() => db.plan.toArray(), [])
  const session = useLiveQuery(() => db.sessions.where('date').equals(today).first(), [today])
  const day = week?.days.find((d) => d.date === today)
  if (!day) return ' '
  const planned = plan?.days[dayIndex(monday, today)]
  const doneId = session && session.done.length > 0 ? session.dayId : undefined
  const workout = days?.find((d) => d.id === (doneId ?? planned))
  const left = day.target.kcal - day.eaten.kcal
  const lead = doneId && workout ? `${workout.short} done`
    : day.type === 'training' ? (workout ? `${workout.short} day` : 'Training day')
    : 'Rest day'
  const fuel = left < 0 ? `${k(-left)} kcal over`
    : day.eaten.kcal === 0 ? `${k(left)} kcal to ${day.type === 'training' ? 'fuel it' : 'spend'}`
    : `${k(left)} kcal left`
  return `${lead} · ${fuel}`
}

/** Greeting: hello for the hour (tinted by the light outside), name, and one smart line. Plays once on open. */
export function Greeting({ today, name, onLogo, logoLabel }: { today: string; name: string; onLogo: () => void; logoLabel: string }) {
  const now = useNow()
  const sky = skyAt(now)
  const line = useLine(today)
  return (
    <div className="gr" data-phase={sky.phase}>
      <button className="logo-btn" onClick={onLogo} aria-label={logoLabel}>
        <Logo size={36} />
      </button>
      <div className="gr-text">
        <span className="gr-hello">{greetingFor(now.getHours())}</span>
        <strong className="gr-name" aria-label={name}>
          {[...name].map((ch, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${0.12 + i * 0.035}s` } as CSSProperties}>{ch}</span>)}
        </strong>
        <span className="gr-line">{line}</span>
      </div>
    </div>
  )
}
