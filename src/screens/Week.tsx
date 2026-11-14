import type { CSSProperties, KeyboardEvent } from 'react'
import { setDayType } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType, type DaySummary } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { Budget } from '../ui/Budget'
import { useFill, useSwipe } from '../ui/motion'

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
  const training = week.days.filter((d) => d.type === 'training').length

  return (
    <section className="td">
      <header className="td-head">
        <div className="td-date">
          <h1>{isThisWeek ? 'This week' : 'Week'}</h1>
          <span>{formatDay(first, { day: 'numeric', month: 'short' })} – {formatDay(last, { day: 'numeric', month: 'short' })} · {training} training, {7 - training} rest</span>
        </div>
        {!isThisWeek && <button className="td-back" onClick={() => onDateChange(today)}>This week</button>}
        <div className="wk-nav">
          <button onClick={() => onDateChange(addDays(first, -7))} aria-label="Previous week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button onClick={() => onDateChange(addDays(first, 7))} aria-label="Next week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </header>

      <div key={first} className="wk-body" {...swipe}>
        <Budget eaten={week.eaten} target={week.pool} fatOver={week.fatOver} scope="this week" />
        {per && per.kcal > 0 && week.daysLeft > 0 && (
          <p className="td-weektext wk-per">
            <b>{k(per.kcal)} kcal a day</b> {week.daysLeft === 1 ? 'for the last day' : `for the ${week.daysLeft} days left`}
          </p>
        )}

        <div className="td-loghead"><h2>Days</h2></div>
        <ul className="td-list wk-list">
          {week.days.map((d, i) => (
            <DayRow
              key={d.date} day={d} index={i} today={today}
              onOpen={() => onOpenDay(d.date)}
              onToggle={() => setDayType(d.date, d.type === 'training' ? 'rest' : 'training', defaultDayType(d.date, settings))}
            />
          ))}
        </ul>
        <p className="td-note">Tap a day to open it. Tap Training or Rest to switch.</p>
      </div>
    </section>
  )
}

function DayRow({ day: d, index, today, onOpen, onToggle }: { day: DaySummary; index: number; today: string; onOpen: () => void; onToggle: () => void }) {
  const ratio = d.target.kcal ? d.eaten.kcal / d.target.kcal : 0
  const over = ratio > 1.1
  const future = d.date > today
  const isToday = d.date === today
  const fill = useFill(Math.min(1, ratio))
  const training = d.type === 'training'
  // Bar colour = where that day's calories came from (P / C / F).
  const kp = d.eaten.protein * 4, kc = d.eaten.carbs * 4, kf = d.eaten.fat * 9
  const tot = kp + kc + kf
  const bar: CSSProperties = {
    width: `${fill * 100}%`,
    transitionDelay: `${0.1 + index * 0.05}s`,
    ...(tot ? { background: `linear-gradient(90deg, var(--protein) 0 ${(kp / tot) * 100}%, var(--carbs) 0 ${((kp + kc) / tot) * 100}%, var(--fat) 0)` } : {}),
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }

  return (
    <li
      className={`wk-row${isToday ? ' now' : ''}${future ? ' future' : ''}`}
      style={{ animationDelay: `${0.04 + index * 0.04}s` }}
      onClick={onOpen} onKeyDown={onKey} role="button" tabIndex={0}
      aria-label={`${formatDay(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${k(d.eaten.kcal)} of ${k(d.target.kcal)} kcal. Open day`}
    >
      <span className="wk-date" aria-hidden="true">
        <b>{formatDay(d.date, { day: 'numeric' })}</b>
        <small>{formatDay(d.date, { weekday: 'short' })}</small>
      </span>
      <span className="wk-mid">
        <span className="wk-top">
          <strong>{isToday ? 'Today' : formatDay(d.date, { weekday: 'long' })}</strong>
          <button
            className={`wk-type${training ? '' : ' rest'}`}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            aria-label={`${training ? 'Training' : 'Rest'} day, tap to switch`}
          >
            <i aria-hidden="true" />{training ? 'Training' : 'Rest'}
          </button>
        </span>
        <span className="wk-bar" aria-hidden="true"><span style={bar} /></span>
        {d.eaten.kcal > 0 && (
          <span className="wk-macros" aria-hidden="true">
            <span><i style={{ background: 'var(--protein)' }} />{k(d.eaten.protein)}g</span>
            <span><i style={{ background: 'var(--carbs)' }} />{k(d.eaten.carbs)}g</span>
            <span><i style={{ background: 'var(--fat)' }} />{k(d.eaten.fat)}g</span>
          </span>
        )}
      </span>
      <span className={`wk-kcal${over ? ' over' : ''}`}>
        {k(d.eaten.kcal)}
        <small>of {k(d.target.kcal)}</small>
      </span>
    </li>
  )
}
