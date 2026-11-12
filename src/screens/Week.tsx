import { setDayType } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { fmtMacros } from '../ui/format'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
  onOpenDay: (d: string) => void
}

export function Week({ date, today, onDateChange, onOpenDay }: Props) {
  const settings = useSettings()
  const week = useWeek(date, today)
  if (!week) return null
  const first = week.days[0].date
  const last = week.days[6].date

  return (
    <section>
      <div className="daynav">
        <button className="icon-btn" onClick={() => onDateChange(addDays(first, -7))} aria-label="Previous week">‹</button>
        <div className="daynav-title">
          <h1>{week.days.some((d) => d.date === today) ? 'This week' : 'Week'}</h1>
          <span className="muted">{formatDay(first, { day: 'numeric', month: 'short' })} – {formatDay(last, { day: 'numeric', month: 'short' })}</span>
        </div>
        <button className="icon-btn" onClick={() => onDateChange(addDays(first, 7))} aria-label="Next week">›</button>
      </div>

      <dl className="card stats">
        <dt>Weekly pool</dt><dd>{fmtMacros(week.pool)}</dd>
        <dt>Eaten</dt><dd>{fmtMacros(week.eaten)}</dd>
        <dt>Left this week</dt><dd>{fmtMacros(week.left)}</dd>
        {week.perDayLeft && <><dt>Per day, {week.daysLeft} day{week.daysLeft === 1 ? '' : 's'} left</dt><dd>{fmtMacros(week.perDayLeft)}</dd></>}
      </dl>
      {week.fatOver > 0 && <p className="warn">Weekly fat is {Math.round(week.fatOver * 10) / 10}g over the pool.</p>}

      <ul className="card list">
        {week.days.map((d) => (
          <li key={d.date} className={d.date === today ? 'is-today' : ''}>
            <button className="item" onClick={() => onOpenDay(d.date)}>
              <strong>{formatDay(d.date)}{d.date === today ? ' · today' : ''}</strong>
              <span className="muted">{Math.round(d.eaten.kcal).toLocaleString('en-US')} / {d.target.kcal.toLocaleString('en-US')} kcal{d.fatOver > 0 ? ` · fat +${Math.round(d.fatOver * 10) / 10}g` : ''}</span>
              <span className="mini-track"><span className="mini-fill" style={{ transform: `scaleX(${Math.min(1, d.target.kcal ? d.eaten.kcal / d.target.kcal : 0)})` }} /></span>
            </button>
            <button className={`pill ${d.type === 'training' ? 'pill-train' : 'pill-rest'}`} onClick={() => setDayType(d.date, d.type === 'training' ? 'rest' : 'training', defaultDayType(d.date, settings))}>
              {d.type === 'training' ? 'Training' : 'Rest'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
