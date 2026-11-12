import type { CSSProperties, KeyboardEvent } from 'react'
import { setDayType } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType, type DaySummary } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { MacroRings } from '../ui/Progress'
import { useCountUp, useSwipe } from '../ui/motion'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
  onOpenDay: (d: string) => void
}

const k = (v: number) => Math.round(v).toLocaleString('en-US')

export function Week({ date, today, onDateChange, onOpenDay }: Props) {
  const settings = useSettings()
  const week = useWeek(date, today)
  const first = week?.days[0].date ?? date
  const swipe = useSwipe(() => onDateChange(addDays(first, 7)), () => onDateChange(addDays(first, -7)))
  if (!week) return null
  const last = week.days[6].date
  const isThisWeek = week.days.some((d) => d.date === today)
  const per = week.perDayLeft

  return (
    <section>
      <div className="daynav">
        <button className="icon-btn" onClick={() => onDateChange(addDays(first, -7))} aria-label="Previous week">‹</button>
        <div className="daynav-title">
          <h1>{isThisWeek ? 'This week' : 'Week'}</h1>
          <span className="muted">{formatDay(first, { day: 'numeric', month: 'short' })} – {formatDay(last, { day: 'numeric', month: 'short' })}</span>
        </div>
        <button className="icon-btn" onClick={() => onDateChange(addDays(first, 7))} aria-label="Next week">›</button>
      </div>

      <div key={first} className="wk-body" {...swipe}>
        <div className="card hero">
          <MacroRings eaten={week.eaten} target={week.pool} />
        </div>
        {per && per.kcal > 0 && week.daysLeft > 0 && (
          <p className="wk-note">
            <strong>{k(per.kcal)}</strong> kcal a day for the {week.daysLeft === 1 ? 'last day' : `last ${week.daysLeft} days`}
          </p>
        )}
        {week.fatOver > 0 && <p className="banner warn">Fat is {Math.round(week.fatOver * 10) / 10}g over for the week.</p>}

        <ul className="wk-days">
          {week.days.map((d, i) => (
            <DayCard
              key={d.date} day={d} index={i} today={today}
              onOpen={() => onOpenDay(d.date)}
              onToggle={() => setDayType(d.date, d.type === 'training' ? 'rest' : 'training', defaultDayType(d.date, settings))}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

function DayCard({ day: d, index, today, onOpen, onToggle }: { day: DaySummary; index: number; today: string; onOpen: () => void; onToggle: () => void }) {
  const ratio = d.target.kcal ? d.eaten.kcal / d.target.kcal : 0
  const over = ratio > 1.1
  const future = d.date > today
  const isToday = d.date === today
  const v = useCountUp(Math.min(1, ratio), 900, 200 + index * 60)

  // Ribbon: length = kcal vs target, colour = that day's protein/carbs/fat mix.
  const kp = d.eaten.protein * 4, kc = d.eaten.carbs * 4, kf = d.eaten.fat * 9
  const tot = kp + kc + kf || 1
  const pa = (kp / tot) * 100, pc = (kc / tot) * 100
  const ribbon = {
    '--s1': `${pa / 2}%`, '--s2': `${pa + pc / 2}%`, '--s3': `${pa + pc + (100 - pa - pc) / 2}%`,
    width: `${Math.min(1, ratio) * 100}%`,
    animationDelay: `${0.15 + index * 0.06}s`,
  } as CSSProperties

  const r = 17, c = 2 * Math.PI * r
  const training = d.type === 'training'
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }

  return (
    <li
      className={`card wk-day${isToday ? ' is-today' : ''}${future ? ' is-future' : ''}${d.eaten.kcal > 0 ? ' has-food' : ''}`}
      style={{ animationDelay: `${0.05 + index * 0.05}s` }}
      onClick={onOpen} onKeyDown={onKey} role="button" tabIndex={0}
      aria-label={`${formatDay(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${k(d.eaten.kcal)} of ${k(d.target.kcal)} kcal. Open day`}
    >
      <svg className="wk-ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} className="wk-ring-track" />
        {v > 0.004 && <circle cx="22" cy="22" r={r} className={`wk-ring-arc${over ? ' over' : ''}`} strokeDasharray={`${v * c} ${c}`} />}
      </svg>
      <span className="wk-ring-num" aria-hidden="true">{formatDay(d.date, { day: 'numeric' })}</span>

      <div className="wk-head">
        <strong>{isToday ? 'Today' : formatDay(d.date, { weekday: 'long' })}</strong>
        <button
          className={`wk-chip ${training ? 'pill-train' : 'pill-rest'}`}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          aria-label={`${training ? 'Training' : 'Rest'} day, tap to switch`}
        >
          {training ? 'Training' : 'Rest'}
        </button>
      </div>
      <span className={`wk-kcal${over ? ' over' : ''}`}>{k(d.eaten.kcal)}<small> / {k(d.target.kcal)}</small></span>

      <span className="wk-ribbon" aria-hidden="true">
        {d.eaten.kcal > 0 && <span className="wk-ribbon-fill" style={ribbon} />}
      </span>
      {d.eaten.kcal > 0 && (
        <span className="wk-macros" aria-hidden="true">
          <span><i style={{ background: 'var(--protein)' }} />{k(d.eaten.protein)}g</span>
          <span><i style={{ background: 'var(--carbs)' }} />{k(d.eaten.carbs)}g</span>
          <span><i style={{ background: 'var(--fat)' }} />{k(d.eaten.fat)}g</span>
        </span>
      )}
    </li>
  )
}
