import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Entry } from '../db/types'
import { copyDay, deleteEntry, restoreEntry, setDayType, updateEntryAmount, updateEntryTime } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType, type WeekSummary } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { fmtAmount } from '../ui/format'
import { useSwipe } from '../ui/motion'
import { Budget } from '../ui/Budget'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
  onAdd: () => void
}

const r1 = (v: number) => Math.round(v * 10) / 10
const k = (v: number) => Math.round(v).toLocaleString('en-US')
const HINT_KEY = 'rf-entry-hint-seen'
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

const TIMES = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 17 },
  { key: 'evening', label: 'Evening', until: 24 },
] as const

export function Today({ date, today, onDateChange, onAdd }: Props) {
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
  // Short notes ("Copied 3 items") fade after a few seconds.
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(t)
  }, [notice])
  // Deleting shows an Undo bar for 5 seconds.
  const [removed, setRemoved] = useState<Entry | null>(null)
  useEffect(() => {
    if (!removed) return
    const t = window.setTimeout(() => setRemoved(null), 5000)
    return () => window.clearTimeout(t)
  }, [removed])
  const remove = async (e: Entry) => { await deleteEntry(e.id!); setRemoved(e) }
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
  const toggleType = () => setDayType(date, training ? 'rest' : 'training', defaultDayType(date, settings))
  const groups = TIMES.map((t, i) => ({
    ...t,
    items: entries.filter((e) => { const h = new Date(e.createdAt).getHours(); return h < t.until && (i === 0 || h >= TIMES[i - 1].until) }),
  })).filter((g) => g.items.length)

  return (
    <section className="td">
      <header className="td-head">
        <div className="td-date">
          <h1>{date === today ? 'Today' : formatDay(date, { weekday: 'long' })}</h1>
          <span>{formatDay(date, { weekday: date === today ? 'long' : undefined, day: 'numeric', month: 'long' })}</span>
        </div>
        {date !== today && <button className="td-back" onClick={() => onDateChange(today)}>Today</button>}
        <button className={`td-type${training ? '' : ' rest'}`} onClick={toggleType} aria-label={`${training ? 'Training' : 'Rest'} day, tap to switch`}>
          <i aria-hidden="true" />{training ? 'Training' : 'Rest'}
        </button>
      </header>

      <div key={`b-${date}`} className={`dayview ${shown.dir}`} {...swipe}>
        <Budget eaten={day.eaten} target={day.target} fatOver={day.fatOver} />
      </div>
      {/* The day picker stays put while the day changes, so its date bubble can glide to the new day. */}
      <div className="dayview" {...swipe}>
        <WeekLine week={week} date={date} today={today} onPick={onDateChange} />
      </div>
      <div key={`l-${date}`} className={`dayview ${shown.dir}`} {...swipe}>
        <div className="td-loghead">
          <h2>Logged</h2>
          {entries.length > 0 && <button className="td-link" onClick={copyYesterday}>Same as yesterday</button>}
        </div>

        {groups.map((g) => (
          <div key={g.key} className="td-group">
            <h3>{g.label}<span>{k(g.items.reduce((t, e) => t + e.kcal, 0))} kcal</span></h3>
            <ul className="td-list">
              {g.items.map((e, i) => <EntryRow key={e.id} entry={e} index={i} onUsed={hideHint} onDelete={remove} />)}
            </ul>
          </div>
        ))}

        <div className="td-group">
          {entries.length === 0 && <h3>Nothing yet</h3>}
          <div className="td-list td-actions">
            <button className="td-addrow" onClick={onAdd}>
              <span aria-hidden="true">+</span>Add food
            </button>
            {entries.length === 0 && (
              <button className="td-addrow quiet" onClick={copyYesterday}>
                <span aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
                </span>Copy {formatDay(yesterday, { weekday: 'long' })}
              </button>
            )}
          </div>
        </div>
        {showHint && entries.length > 0 && <p className="td-note">Tap a food to change it, swipe left to delete.</p>}
        {notice && <p key={notice} className="td-note flash" role="status">{notice}</p>}
      </div>
      {removed && (
        <div className="add-toast above-tabs" role="status">
          <span>{removed.name} deleted</span>
          <button onClick={() => { restoreEntry(removed); setRemoved(null) }}>Undo</button>
        </div>
      )}
    </section>
  )
}

/** A day "fits" when it lands within 10% of its own calorie target. */
const FIT = 0.1

/** Seven days as dots (also the day picker) and one sentence about the week. The picked day wears a bubble with its date
 *  (green on today, ink on any other day) that glides between days; today keeps its green ring when another day is picked. */
function WeekLine({ week, date, today, onPick }: { week: WeekSummary; date: string; today: string; onPick: (d: string) => void }) {
  const sel = Math.max(0, week.days.findIndex((d) => d.date === date))
  const done = week.days.filter((d) => d.date < today)
  const banked = done.reduce((t, d) => t + d.target.kcal - d.eaten.kcal, 0)
  const weekOver = week.daysLeft === 0 ? week.left.kcal < 0 : banked < 0
  const amount = week.daysLeft === 0 ? Math.abs(week.left.kcal) : Math.abs(banked)
  const per = week.perDayLeft

  return (
    <div className="td-week">
      <div className="td-dots" role="list" aria-label="This week" style={{ '--sel': sel } as CSSProperties}>
        <span className={`td-bubble${date === today ? ' now' : ''}`} aria-hidden="true">
          <i key={date}><b>{Number(date.slice(8))}</b></i>
        </span>
        {week.days.map((d) => {
          const ratio = d.target.kcal ? d.eaten.kcal / d.target.kcal : 0
          const state = d.date > today ? 'future' : d.date === today ? 'now'
            : d.eaten.kcal === 0 ? 'empty' : ratio > 1 + FIT ? 'over' : ratio < 1 - FIT ? 'under' : 'fit'
          return (
            <button
              key={d.date} role="listitem" className={`td-dot ${state}${d.date === date ? ' sel' : ''}`}
              onClick={() => onPick(d.date)}
              aria-label={`${formatDay(d.date, { weekday: 'long' })}: ${k(d.eaten.kcal)} of ${k(d.target.kcal)} kcal`}
              aria-current={d.date === date ? 'date' : undefined}
            >
              <span>{formatDay(d.date, { weekday: 'narrow' })}</span>
              <i aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <p className="td-weektext">
        {week.daysLeft === 0 ? (
          <><b className={weekOver ? 'over' : ''}>{k(amount)} kcal {weekOver ? 'over' : 'under'}</b> for the week</>
        ) : done.length === 0 ? (
          <><b>{k(per?.kcal ?? 0)} kcal a day</b> keeps the week on budget</>
        ) : weekOver ? (
          <><b className="over">{k(amount)} kcal over</b> so far{per && per.kcal > 0 ? ` · aim for ${k(per.kcal)} a day` : ''}</>
        ) : (
          <><b>On track</b> · {k(amount)} kcal banked{per && per.kcal > 0 ? ` · up to ${k(per.kcal)} a day` : ''}</>
        )}
      </p>
    </div>
  )
}

const OPEN = -88

function EntryRow({ entry: e, index, onUsed, onDelete }: { entry: Entry; index: number; onUsed: () => void; onDelete: (e: Entry) => void }) {
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
  // Small P/C/F pill on the left: where this food's calories come from.
  const mark = { background: `linear-gradient(180deg, var(--protein) 0 ${(kp / tot) * 100}%, var(--carbs) 0 ${((kp + kc) / tot) * 100}%, var(--fat) 0)` } as CSSProperties

  const save = async () => {
    const v = Number(amount)
    if (v > 0) await updateEntryAmount(e.id!, v)
    setEditing(false)
  }

  return (
    <li className="td-row" style={{ animationDelay: `${0.05 + index * 0.05}s` }}>
      <div className="entry-swipe">
        <button className="entry-del" style={{ visibility: x < 0 ? 'visible' : 'hidden' }} onClick={() => onDelete(e)} aria-label={`Delete ${e.name}`} tabIndex={open ? 0 : -1}>Delete</button>
        <div
          className={`td-face${drag !== null ? ' dragging' : ''}`}
          style={{ transform: `translateX(${x}px)` }}
          onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
          onClick={onClick}
          role="button" tabIndex={0} aria-expanded={editing} aria-label={`${e.name}, ${k(e.kcal)} kcal. Tap to edit`}
          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setEditing((v) => !v) } }}
        >
          <span className="td-mark" style={mark} aria-hidden="true" />
          <div className="td-text">
            <strong>{e.name}{e.estimate && <span className="tag">est.</span>}</strong>
            <span>{fmtAmount(e.amount, e.unit)} · {time(e.createdAt)}</span>
          </div>
          <span className="td-kcal">{k(e.kcal)}</span>
        </div>
      </div>
      {editing && (
        <div className="td-detail">
          <div className="td-detail-macros">
            <span><i style={{ background: 'var(--protein)' }} />{r1(e.protein)}g protein</span>
            <span><i style={{ background: 'var(--carbs)' }} />{r1(e.carbs)}g carbs</span>
            <span><i style={{ background: 'var(--fat)' }} />{r1(e.fat)}g fat</span>
          </div>
          <form className="entry-edit" onSubmit={(ev) => { ev.preventDefault(); save() }}>
            <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(ev) => setAmount(ev.target.value)} aria-label="Amount" />
            <button type="submit" className="primary">Save</button>
            <button type="button" className="danger" onClick={() => onDelete(e)}>Delete</button>
          </form>
          <WhenSwitch entry={e} />
        </div>
      )}
    </li>
  )
}

/** Morning / Afternoon / Evening for one logged item. Moving it keeps the minutes, only the hour changes. */
function WhenSwitch({ entry: e }: { entry: Entry }) {
  const hour = new Date(e.createdAt).getHours()
  const at = TIMES.findIndex((t) => hour < t.until)
  const move = (i: number) => {
    if (i === at) return
    const d = new Date(e.createdAt)
    d.setHours([9, 14, 19][i])
    updateEntryTime(e.id!, d.getTime())
  }
  return (
    <div className="unit-seg td-when" role="radiogroup" aria-label="Part of the day" style={{ '--n': 3, '--i': at } as CSSProperties}>
      <span className="unit-thumb" aria-hidden />
      {TIMES.map((t, i) => (
        <button key={t.key} type="button" role="radio" aria-checked={i === at} onClick={() => move(i)}>{t.label}</button>
      ))}
    </div>
  )
}
