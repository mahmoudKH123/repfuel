import { type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { greetingFor, skyAt } from '../logic/sun'
import { useNow, useWeek } from './hooks'
import { formatDay } from '../logic/dates'
import { Logo } from './Logo'

/** Living logo data: the charge is today's calories eaten vs target; plates sit on the bar once the workout is
 *  finished (or on a rest day, when nothing is owed). */
function useFuel(today: string): { charge: number; plates: boolean } {
  const week = useWeek(today, today)
  const session = useLiveQuery(() => db.sessions.where('date').equals(today).first(), [today])
  const day = week?.days.find((d) => d.date === today)
  if (!day) return { charge: 0, plates: true }
  return {
    charge: day.target.kcal > 0 ? day.eaten.kcal / day.target.kcal : 0,
    plates: day.type === 'rest' || !!session?.finishedAt,
  }
}

/** Top row on every tab: the living logo tile (where the launch intro lands) and, beside it, three lines exactly as
 *  tall as the tile: hello for the hour, your name, today's date (16 + 24 + 14 = 54 px). Plays once on open. */
export function Greeting({ today, name, onLogo, logoLabel }: { today: string; name: string; onLogo: () => void; logoLabel: string }) {
  const now = useNow()
  const sky = skyAt(now)
  const fuel = useFuel(today)
  return (
    <div className="gr" data-phase={sky.phase}>
      <button className="logo-btn" onClick={onLogo} aria-label={`${logoLabel}. ${Math.round(fuel.charge * 100)}% of today's calories eaten`}>
        <Logo size={54} charge={fuel.charge} plates={fuel.plates} />
      </button>
      <div className="gr-text">
        <span className="gr-hello">{greetingFor(now.getHours())}</span>
        <strong className="gr-name" aria-label={name}>
          {[...name].map((ch, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${0.12 + i * 0.035}s` } as CSSProperties}>{ch}</span>)}
        </strong>
        <span className="gr-day">{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
    </div>
  )
}
