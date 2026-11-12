import { useRef, useState, type TouchEvent } from 'react'
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
import { clamp, useFill, useSwipe } from '../ui/motion'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
}

const r1 = (v: number) => Math.round(v * 10) / 10
const k = (v: number) => Math.round(v).toLocaleString('en-US')

export function Today({ date, today, onDateChange }: Props) {
  const settings = useSettings()
  const week = useWeek(date, today)
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]) ?? []
  const [notice, setNotice] = useState('')
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

        <WeekBudget week={week} />

        <div className="section-head">
          <h2>Logged</h2>
          {entries.length > 0 && <span className="count">{entries.length} item{entries.length === 1 ? '' : 's'} · {k(day.eaten.kcal)} kcal</span>}
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
            {groupEntries(entries).map((g) => (
              <div key={g.name} className="group">
                <div className="group-head"><span>{g.name}</span><span>{k(g.kcal)} kcal</span></div>
                <ul className="card log">
                  {g.items.map((e, i) => <EntryRow key={e.id} entry={e} index={i} />)}
                </ul>
              </div>
            ))}
            <p className="hint muted">Tap a food to change the amount, swipe left to delete.</p>
            <button className="link" onClick={copyYesterday}>Same as yesterday</button>
          </>
        )}
        {notice && <p className="muted" role="status">{notice}</p>}
      </div>
    </section>
  )
}

function WeekBudget({ week }: { week: WeekSummary }) {
  const used = useFill(clamp(week.pool.kcal ? week.eaten.kcal / week.pool.kcal : 0))
  const per = week.perDayLeft
  const overWeek = week.left.kcal < 0
  return (
    <div className="card budget">
      <div className="budget-head">
        <span className="eyebrow">This week</span>
        <span className="muted">{week.daysLeft ? `${week.daysLeft} day${week.daysLeft === 1 ? '' : 's'} left` : 'Finished'}</span>
      </div>
      {per && per.kcal > 0 ? (
        <>
          <p className="budget-big"><strong>{k(per.kcal)}</strong> kcal a day</p>
          <p className="muted budget-sub">keeps you on track for the rest of the week</p>
        </>
      ) : (
        <p className="budget-big"><strong className={overWeek ? 'over' : ''}>{k(Math.abs(week.left.kcal))}</strong> kcal {overWeek ? 'over' : 'left'}</p>
      )}
      <div className="budget-track"><div className={`budget-fill${overWeek ? ' over' : ''}`} style={{ transform: `scaleX(${used})` }} /></div>
      <div className="budget-foot muted">
        <span>{k(week.eaten.kcal)} of {k(week.pool.kcal)} kcal used</span>
      </div>
      {per && per.kcal > 0 && (
        <div className="budget-pills">
          <span className="mpill p">{k(per.protein)}g protein</span>
          <span className="mpill c">{k(per.carbs)}g carbs</span>
          <span className="mpill f">{k(per.fat)}g fat</span>
        </div>
      )}
    </div>
  )
}

function groupEntries(entries: Entry[]) {
  const groups = [
    { name: 'Morning', items: [] as Entry[], kcal: 0 },
    { name: 'Afternoon', items: [] as Entry[], kcal: 0 },
    { name: 'Evening', items: [] as Entry[], kcal: 0 },
  ]
  for (const e of entries) {
    const h = new Date(e.createdAt).getHours()
    const g = groups[h < 12 ? 0 : h < 17 ? 1 : 2]
    g.items.push(e)
    g.kcal += e.kcal
  }
  return groups.filter((g) => g.items.length)
}

/** Colour of the macro that gives the most calories. */
function mainColor(e: Entry): string {
  const p = e.protein * 4, c = e.carbs * 4, f = e.fat * 9
  if (p >= c && p >= f) return 'var(--protein)'
  return c >= f ? 'var(--carbs)' : 'var(--fat)'
}

const OPEN = -88

function EntryRow({ entry: e, index }: { entry: Entry; index: number }) {
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
  const tap = () => (open ? setOpen(false) : setEditing((v) => !v))
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
    if (drag !== null) setOpen(drag < OPEN / 2)
    setDrag(null)
  }

  const x = drag ?? (open ? OPEN : 0)
  const kp = e.protein * 4, kc = e.carbs * 4, kf = e.fat * 9
  const tot = kp + kc + kf || 1
  const color = mainColor(e)

  const save = async () => {
    const v = Number(amount)
    if (v > 0) await updateEntryAmount(e.id!, v)
    setEditing(false)
  }

  return (
    <li className="entry" style={{ animationDelay: `${0.05 + index * 0.04}s` }}>
      <div className="entry-swipe">
        <button className="entry-del" style={{ visibility: x < 0 ? 'visible' : 'hidden' }} onClick={() => deleteEntry(e.id!)} aria-label={`Delete ${e.name}`} tabIndex={open ? 0 : -1}>Delete</button>
        <div
          className={`entry-face${drag !== null ? ' dragging' : ''}`}
          style={{ transform: `translateX(${x}px)` }}
          onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
          onClick={onClick}
          role="button" tabIndex={0} aria-expanded={editing} aria-label={`${e.name}, ${k(e.kcal)} kcal. Tap to edit`}
          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setEditing((v) => !v) } }}
        >
          <span className="bubble" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>{e.name.trim().charAt(0).toUpperCase()}</span>
          <div className="entry-main">
            <div className="entry-top">
              <strong>{e.name}{e.estimate && <span className="tag">est.</span>}</strong>
              <span className="entry-kcal">{k(e.kcal)}<small> kcal</small></span>
            </div>
            <div className="entry-sub">
              <span className="muted">{fmtAmount(e.amount, e.unit)}</span>
              <span className="muted entry-macros">{r1(e.protein)}P · {r1(e.carbs)}C · {r1(e.fat)}F</span>
            </div>
            <span className="split" aria-hidden="true">
              <i style={{ width: `${(kp / tot) * 100}%`, background: 'var(--protein)' }} />
              <i style={{ width: `${(kc / tot) * 100}%`, background: 'var(--carbs)' }} />
              <i style={{ width: `${(kf / tot) * 100}%`, background: 'var(--fat)' }} />
            </span>
          </div>
        </div>
      </div>
      {editing && (
        <form className="entry-edit" onSubmit={(ev) => { ev.preventDefault(); save() }}>
          <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(ev) => setAmount(ev.target.value)} autoFocus aria-label="Amount" />
          <button type="submit" className="primary">Save</button>
          <button type="button" className="danger" onClick={() => deleteEntry(e.id!)}>Delete</button>
        </form>
      )}
    </li>
  )
}
