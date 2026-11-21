import { type CSSProperties } from 'react'
import { greetingFor, skyAt } from '../logic/sun'
import { useNow } from './hooks'
import { formatDay } from '../logic/dates'

/** Top of every tab, as a large title: hello for the hour, your name and today's date. Plays once on open. */
export function Greeting({ today, name }: { today: string; name: string }) {
  const now = useNow()
  const sky = skyAt(now)
  return (
    <div className="gr" data-phase={sky.phase}>
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
