import { useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Entry } from '../db/types'
import { copyDay, deleteEntry, setDayType, updateEntryAmount } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType, type WeekSummary } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { fmtAmount } from '../ui/format'
import { MacroRings } from '../ui/Progress'
import { WeekStrip } from '../ui/WeekStrip'
import { useSwipe } from '../ui/motion'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
}

const r1 = (v: number) => Math.round(v * 10) / 10
const k = (v: number) => Math.round(v).toLocaleString('en-US')
const HINT_KEY = 'rf-entry-hint-seen'
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function Today({ date, today, onDateChange }: Props) {
  const settings = useSettings()
  const week = useWeek(date, today)
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]) ?? []
  const [notice, setNotice] = useState('')
  const [showHint, setShowHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY) } catch { return true } })
  const hideHint = () => {
    if (!showHint) return
    setShowHint(false)
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode: hint just comes back next time */ }
  }
  const [shown, setShown] = useState({ date, dir: '' })
  if (shown.date !== date) setShown({ date, dir: date > shown.date ? 'next' : 'prev' })
  const swipe = useSwipe(() => onDateChange(addDays(date, 1)), () => onDateChange(addDays(date, -1)))

  const day = week?.days.find((d) => d.date === date)
  if (!week || !day) return null

  const yesterday = addDays(date, -1)
  const copyYesterday = async () => {
    const count = await copyDay(yesterday, date)
    setNotice(count ? `Copied ${count} item${count === 1 ? '' : 's'} from ${formatDay(yesterday)}` : `Nothing logged on ${formatDay(yesterday)}`)
  }

  const training = day.type === 'training'
  const maxKcal = Math.max(0, ...entries.map((e) => e.kcal))
  const toggleType = () => setDayType(date, training ? 'rest' : 'training', defaultDayType(date, settings))

  return (
    <section>
      <WeekStrip days={week.days} date={date} today={today} onPick={onDateChange} onWeek={(n) => onDateChange(addDays(date, n))} />

      <div key={date} className={`dayview ${shown.dir}`} {...swipe}>
        <div className="daytitle">
          <h1>{date === today ? 'Today' : formatDay(date, { weekday: 'long' })}</h1>
          <span className="muted">{formatDay(date, { day: 'numeric', month: 'long' })}</span>
        </div>
        <div className="pillrow">
          <button className={`pill ${training ? 'pill-train' : 'pill-rest'}`} onClick={toggleType} aria-label={`${training ? 'Training' : 'Rest'} day, tap to switch`}>
            {training ? 'Training day' : 'Rest day'}
          </button>
          {date !== today && <button className="pill" onClick={() => onDateChange(today)}>Back to today</button>}
        </div>

        <div className="card hero">
          <MacroRings eaten={day.eaten} target={day.target} />
        </div>
        {day.fatOver > 0 && <p className="banner warn">Fat is {r1(day.fatOver)}g over today's target.</p>}

        <WeekPulse week={week} date={date} today={today} onPick={onDateChange} />

        <div className="section-head">
          <h2>Logged</h2>
          {entries.length > 0 && <span className="count">{k(day.eaten.kcal)} kcal</span>}
          {entries.length > 0 && <button className="quiet" onClick={copyYesterday}>Same as yesterday</button>}
        </div>
        {entries.length === 0 ? (
          <div className="card empty">
            <span className="empty-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7h3" />
              </svg>
            </span>
            <strong>Nothing logged yet</strong>
            <p className="muted">Tap + to add your first food.</p>
            <button onClick={copyYesterday}>Copy {formatDay(yesterday)}</button>
          </div>
        ) : (
          <>
            <ul className="fuel">
              {entries.map((e, i) => (
                <EntryRow key={e.id} entry={e} index={i} scale={maxKcal ? e.kcal / maxKcal : 0} onUsed={hideHint} />
              ))}
            </ul>
            {showHint && <p className="hint muted">Tap a food to edit, swipe left to delete.</p>}
          </>
        )}
        {notice && <p className="muted" role="status">{notice}</p>}
      </div>
    </section>
  )
}

/** A day "fits" when it lands within 10% of its own calorie target. */
const FIT = 0.1

function WeekPulse({ week, date, today, onPick }: { week: WeekSummary; date: string; today: string; onPick: (d: string) => void }) {
  const done = week.days.filter((d) => d.date < today)
  const sofar = week.days.filter((d) => d.date <= today)
  const banked = done.reduce((t, d) => t + d.target.kcal - d.eaten.kcal, 0)
  const weekOver = week.daysLeft === 0 ? week.left.kcal < 0 : banked < 0
  const amount = week.daysLeft === 0 ? Math.abs(week.left.kcal) : Math.abs(banked)
  const per = week.perDayLeft
  const fitted = done.filter((d) => Math.abs(d.eaten.kcal / d.target.kcal - 1) <= FIT).length

  const pct = (key: 'protein' | 'carbs' | 'fat') => {
    const goal = sofar.reduce((t, d) => t + d.target[key], 0)
    return goal ? Math.round((sofar.reduce((t, d) => t + d.eaten[key], 0) / goal) * 100) : 0
  }
  const macros = [
    { key: 'protein', label: 'P', color: 'var(--protein)' },
    { key: 'carbs', label: 'C', color: 'var(--carbs)' },
    { key: 'fat', label: 'F', color: 'var(--fat)' },
  ] as const

  return (
    <div className="card pulse">
      <div className="pulse-head">
        <span className="eyebrow">This week</span>
        {done.length > 0 && (
          <span className={`pulse-tag${weekOver ? ' over' : ''}`}>{weekOver ? 'Over budget' : 'On track'}</span>
        )}
      </div>

      <div className="pulse-chart" role="list">
        <span className="pulse-target" aria-hidden="true" />
        {week.days.map((d, i) => {
          const ratio = d.target.kcal ? d.eaten.kcal / d.target.kcal : 0
          const future = d.date > today
          const state = future ? 'future' : d.date === today ? 'today'
            : ratio > 1 + FIT ? 'over' : ratio < 1 - FIT ? 'under' : 'fit'
          const h = future ? 1 : Math.min(ratio, 1.3)
          return (
            <button
              key={d.date} role="listitem" className={`pulse-col${d.date === date ? ' sel' : ''}`}
              onClick={() => onPick(d.date)}
              aria-label={`${formatDay(d.date, { weekday: 'long' })}: ${k(d.eaten.kcal)} of ${k(d.target.kcal)} kcal`}
            >
              <span className="pulse-slot">
                <span className={`pulse-bar ${state}`} style={{ height: `${(h / 1.3) * 100}%`, animationDelay: `${0.1 + i * 0.06}s` }} />
              </span>
              <span className="pulse-day">{formatDay(d.date, { weekday: 'narrow' })}</span>
            </button>
          )
        })}
      </div>

      <p className="pulse-line">
        {week.daysLeft === 0 ? (
          <><strong className={weekOver ? 'over' : ''}>{k(amount)}</strong> kcal {weekOver ? 'over' : 'under'} for the week</>
        ) : done.length === 0 ? (
          <><strong>{k(per?.kcal ?? 0)}</strong> kcal a day keeps you on budget</>
        ) : (
          <><strong className={weekOver ? 'over' : ''}>{k(amount)}</strong> kcal {weekOver ? 'over' : 'banked'}
            {per && per.kcal > 0 && <span className="muted"> · today up to {k(per.kcal)}</span>}</>
        )}
      </p>
      <div className="pulse-foot">
        {done.length > 0 && <span className="muted">{fitted} of {done.length} day{done.length === 1 ? '' : 's'} on target</span>}
        <span className="pulse-macros">
          {macros.map((m) => {
            const v = pct(m.key)
            return <span key={m.key} className={m.key === 'fat' && v > 100 ? 'over' : ''}><b style={{ color: m.color }}>{m.label}</b> {v}%</span>
          })}
        </span>
      </div>
    </div>
  )
}

const OPEN = -88

function EntryRow({ entry: e, index, scale, onUsed }: { entry: Entry; index: number; scale: number; onUsed: () => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(e.amount))
  const [drag, setDrag] = useState<number | null>(null)
  const t0 = useRef<{ x: number; y: number; base: number; axis?: 'h' | 'v' } | null>(null)

  const onStart = (ev: TouchEvent) => {
    ev.stopPropagation()
    const t = ev.touches[0]
    t0.current = { x: t.clientX, y: t.clientY, base: open ? OPEN : 0 }
  }
  const onMove = (ev: TouchEvent) => {
    const s = t0.current
    if (!s) return
    const t = ev.touches[0]
    const mx = t.clientX - s.x
    const my = t.clientY - s.y
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      s.axis = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
    }
    if (s.axis === 'h') setDrag(Math.max(OPEN - 24, Math.min(0, s.base + mx)))
  }
  const lastTouchTap = useRef(0)
  const tap = () => { onUsed(); if (open) setOpen(false); else setEditing((v) => !v) }
  // Taps from touch are handled in onEnd; this is for mouse and keyboard only.
  const onClick = () => { if (Date.now() - lastTouchTap.current > 700) tap() }
  const onEnd = (ev: TouchEvent) => {
    ev.stopPropagation()
    const s = t0.current
    t0.current = null
    if (s && !s.axis) {
      // A plain tap: handle it here and skip the delayed click iOS would send.
      ev.preventDefault()
      lastTouchTap.current = Date.now()
      tap()
      return
    }
    if (drag !== null) { setOpen(drag < OPEN / 2); onUsed() }
    setDrag(null)
  }

  const x = drag ?? (open ? OPEN : 0)
  const kp = e.protein * 4, kc = e.carbs * 4, kf = e.fat * 9
  const tot = kp + kc + kf || 1
  const pa = (kp / tot) * 100, pc = (kc / tot) * 100
  // Soft blend: each macro's colour sits at the middle of its share of the bar.
  const fill = {
    '--s1': `${pa / 2}%`, '--s2': `${pa + pc / 2}%`, '--s3': `${pa + pc + (100 - pa - pc) / 2}%`,
    width: `${Math.max(0.22, Math.min(1, scale)) * 100}%`,
    animationDelay: `${0.1 + index * 0.07}s`,
  } as CSSProperties

  const save = async () => {
    const v = Number(amount)
    if (v > 0) await updateEntryAmount(e.id!, v)
    setEditing(false)
  }

  return (
    <li className="fuel-row" style={{ animationDelay: `${0.05 + index * 0.07}s` }}>
      <div className="entry-swipe">
        <button className="entry-del" style={{ visibility: x < 0 ? 'visible' : 'hidden' }} onClick={() => deleteEntry(e.id!)} aria-label={`Delete ${e.name}`} tabIndex={open ? 0 : -1}>Delete</button>
        <div
          className={`fuel-face${drag !== null ? ' dragging' : ''}`}
          style={{ transform: `translateX(${x}px)` }}
          onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
          onClick={onClick}
          role="button" tabIndex={0} aria-expanded={editing} aria-label={`${e.name}, ${k(e.kcal)} kcal. Tap to edit`}
          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setEditing((v) => !v) } }}
        >
          <span className="fuel-fill" style={fill} aria-hidden="true" />
          <div className="fuel-text">
            <strong>{e.name}{e.estimate && <span className="tag">est.</span>}</strong>
            <span className="fuel-sub">{fmtAmount(e.amount, e.unit)} · {time(e.createdAt)}</span>
          </div>
          <span className="fuel-kcal">{k(e.kcal)}<small> kcal</small></span>
        </div>
      </div>
      {editing && (
        <div className="fuel-detail">
          <div className="fuel-macros">
            <span><i style={{ background: 'var(--protein)' }} />{r1(e.protein)}g protein</span>
            <span><i style={{ background: 'var(--carbs)' }} />{r1(e.carbs)}g carbs</span>
            <span><i style={{ background: 'var(--fat)' }} />{r1(e.fat)}g fat</span>
          </div>
          <form className="entry-edit" onSubmit={(ev) => { ev.preventDefault(); save() }}>
            <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(ev) => setAmount(ev.target.value)} autoFocus aria-label="Amount" />
            <button type="submit" className="primary">Save</button>
            <button type="button" className="danger" onClick={() => deleteEntry(e.id!)}>Delete</button>
          </form>
        </div>
      )}
    </li>
  )
}
