import { useState } from 'react'
import type { DaySummary } from '../logic/budget'
import { formatDay, fromKey } from '../logic/dates'
import { clamp, useFill, useSwipe } from './motion'

const R = 15
const C = 2 * Math.PI * R

function DayCell({ day, selected, isToday, onPick }: { day: DaySummary; selected: boolean; isToday: boolean; onPick: () => void }) {
  const ratio = day.target.kcal ? day.eaten.kcal / day.target.kcal : 0
  const fill = useFill(clamp(ratio))
  const over = ratio > 1.05
  return (
    <button
      className={`strip-day${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
      onClick={onPick}
      aria-label={formatDay(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
      aria-current={selected ? 'date' : undefined}
    >
      <span className="strip-wd">{formatDay(day.date, { weekday: 'narrow' })}</span>
      <span className="strip-ring">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r={R} className="strip-track" />
          <circle cx="18" cy="18" r={R} className="strip-fill" style={{ stroke: over ? 'var(--fat)' : 'var(--kcal)', strokeDasharray: C, strokeDashoffset: C * (1 - fill) }} />
        </svg>
        <span className="strip-num">{fromKey(day.date).getDate()}</span>
      </span>
    </button>
  )
}

/** Seven days of the current week. Tap a day; swipe the strip to change weeks. */
export function WeekStrip({ days, date, today, onPick, onWeek }: {
  days: DaySummary[]; date: string; today: string; onPick: (d: string) => void; onWeek: (delta: number) => void
}) {
  const first = days[0].date
  const [shown, setShown] = useState({ first, dir: '' })
  if (shown.first !== first) setShown({ first, dir: first > shown.first ? 'next' : 'prev' })
  const swipe = useSwipe(() => onWeek(7), () => onWeek(-7), true)
  return (
    <div className="strip" {...swipe}>
      <div key={first} className={`strip-row ${shown.dir}`}>
        {days.map((d) => (
          <DayCell key={d.date} day={d} selected={d.date === date} isToday={d.date === today} onPick={() => onPick(d.date)} />
        ))}
      </div>
    </div>
  )
}
