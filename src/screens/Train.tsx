import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, PlanDay, WeekPlan, WeightUnit } from '../db/types'
import { addExerciseToDay, ensureWeek, removeExerciseFromDay, saveExercise, saveWeek, toggleExerciseDone } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { applyWeights, cancelAttempt, fmtWeight, recordAttempt, startAttempt, volumeKg } from '../logic/train'
import { DEFAULT_WEEK, WEEKDAYS, dayIndex, findFrom, missedDays, mondayOf, reshuffle, type Reshuffle } from '../logic/schedule'
import { useCountUp, useFill } from '../ui/motion'
import { WeightDial, type DialMode } from '../ui/WeightDial'

const fmt = (v: number) => Math.round(v).toLocaleString('en-US')
const FULL_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Overflow = { plan: WeekPlan; r: Reshuffle }

export function Train({ today }: { today: string }) {
  const week = mondayOf(today)
  const ti = dayIndex(week, today)
  const plan = useLiveQuery(() => db.plan.orderBy('order').toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.where('date').between(week, addDays(week, 6), true, true).toArray(), [week])
  const wp = useLiveQuery(() => db.weeks.get(week), [week])
  const [editing, setEditing] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [sheet, setSheet] = useState<number | null>(null)
  const [overflow, setOverflow] = useState<Overflow | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shuffleKey, setShuffleKey] = useState(0)

  useEffect(() => { ensureWeek(week, today) }, [week, today])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3800)
    return () => window.clearTimeout(t)
  }, [toast])

  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises])
  const days = useMemo(() => new Map((plan ?? []).map((d) => [d.id, d])), [plan])
  // Days this week where something was ticked, and what was trained there.
  const trained = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of sessions ?? []) if (s.done.length > 0 && s.date <= today) m.set(dayIndex(week, s.date), s.dayId)
    return m
  }, [sessions, week, today])

  const todaySession = sessions?.find((s) => s.date === today)
  const trainedToday = trained.has(ti)
  const from = trainedToday ? ti + 1 : ti
  const nameOf = (id: string) => days.get(id)?.name ?? 'Rest'

  const describe = (r: Reshuffle) => r.moved.length
    ? r.moved.slice(0, 2).map((m) => `${days.get(m.id)?.short ?? m.id} → ${WEEKDAYS[m.to]}`).join(', ')
    : 'Week updated'

  const apply = async (next: WeekPlan, r: Reshuffle, msg?: string) => {
    if (r.drop.length) { setOverflow({ plan: next, r }); return }
    await saveWeek({ ...next, days: r.days }, today)
    setShuffleKey((k) => k + 1)
    setToast(msg ? `${msg} · ${describe(r)}` : describe(r))
  }

  // Auto-skip: a training day that passed with nothing ticked gets fitted into the rest of the week.
  useEffect(() => {
    if (!wp || !sessions || overflow || wp.declined) return
    const missed = missedDays(wp, ti, trained)
    if (!missed.length) return
    const next = { ...wp, missed: [...wp.missed, ...missed] }
    const names = missed.map((i) => days.get(wp.days[i])?.short ?? wp.days[i]).join(', ')
    apply(next, reshuffle(next, from, trained), `Missed ${names}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wp, sessions, ti])

  if (!plan || !exercises || !sessions || !wp) return null

  const dayId = trainedToday && todaySession ? todaySession.dayId : wp.days[ti]
  const day = days.get(dayId)
  const session = todaySession?.dayId === dayId ? todaySession : undefined
  const done = new Set(session?.done ?? [])
  const list = (day?.exerciseIds ?? []).map((id) => byId.get(id)).filter((e): e is Exercise => !!e)
  const nextIdx = wp.days.findIndex((d, i) => i > ti && d !== 'rest')
  const upNext = nextIdx >= 0 ? `${WEEKDAYS[nextIdx]} · ${nameOf(wp.days[nextIdx])}` : undefined

  const toggle = async (id: string) => {
    const justFinished = await toggleExerciseDone(today, dayId, id, list.map((e) => e.id))
    if (justFinished) setCelebrate(true)
  }

  /** Rest on a day = can't train: everything still owed is re-fitted into the open days. */
  const restOn = (i: number) => {
    const next = { ...wp, blocked: [...new Set([...wp.blocked, i])], declined: false }
    apply(next, reshuffle(next, from, trained), i === ti ? 'Rest today' : `Rest ${WEEKDAYS[i]}`)
  }
  /** Put a workout on a day; if it's already on another day the two swap. */
  const setDay = async (i: number, id: string) => {
    const d = [...wp.days]
    const j = findFrom(d, id, from)
    if (j >= 0 && j !== i) d[j] = d[i]
    d[i] = id
    await saveWeek({
      ...wp, days: d, blocked: wp.blocked.filter((b) => b !== i),
      owed: wp.owed.includes(id) ? wp.owed : [...wp.owed, id], dropped: wp.dropped.filter((x) => x !== id),
    }, today)
    setShuffleKey((k) => k + 1)
  }
  const resetWeek = async () => {
    const base = { ...wp, days: [...DEFAULT_WEEK], blocked: [], dropped: [], missed: [], declined: false }
    const keepPast = base.days.map((x, i) => (i < from ? (trained.get(i) ?? x) : x))
    await saveWeek({ ...base, days: keepPast }, today)
    setShuffleKey((k) => k + 1)
    setToast('Back to your normal week')
  }

  return (
    <section className="td tr">
      <header className="td-head">
        <div className="td-date">
          <h1>Train</h1>
          <span>{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        {day && (
          <button className={`td-back tr-edit${editing ? ' on' : ''}`} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      <WeekStrip
        wp={wp} ti={ti} trained={trained} todayId={dayId} shuffleKey={shuffleKey} days={days}
        onOpen={(i) => setSheet(i)}
      />
      {wp.dropped.length > 0 && <p className="tr-dropped">Skipped this week: {wp.dropped.map(nameOf).join(', ')}</p>}

      {!day ? (
        <RestCard
          nextName={upNext}
          onTrain={nextIdx >= 0 ? () => setDay(ti, wp.days[nextIdx]) : undefined}
        />
      ) : (
        <div key={dayId} className="tr-body">
          <Hero day={day} list={list} done={done.size} finished={!!session?.finishedAt} nextName={upNext} />
          {!trainedToday && !editing && (
            <button className="tr-skip" onClick={() => restOn(ti)}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
              Can&apos;t train today
            </button>
          )}
          <ul className="tr-list">
            {list.map((e, i) => (
              <ExerciseCard
                key={e.id} e={e} index={i} done={done.has(e.id)} editing={editing}
                onToggle={() => toggle(e.id)}
                onRemove={() => removeExerciseFromDay(day.id, e.id)}
              />
            ))}
          </ul>
          {editing && <AddExercise day={day} />}
        </div>
      )}

      {sheet !== null && (
        <DaySheet
          i={sheet} wp={wp} plan={plan} isToday={sheet === ti} locked={sheet < from} from={from}
          onPick={(id) => { setSheet(null); setDay(sheet, id) }}
          onRest={() => { setSheet(null); restOn(sheet) }}
          onReset={() => { setSheet(null); resetWeek() }}
          onClose={() => setSheet(null)}
        />
      )}
      {overflow && (
        <OverflowSheet
          names={overflow.r.drop.map(nameOf)}
          onSkip={async () => {
            const { plan: p, r } = overflow
            setOverflow(null)
            await saveWeek({ ...p, days: r.days, dropped: [...p.dropped, ...r.drop] }, today)
            setShuffleKey((k) => k + 1)
            setToast(`${r.drop.map(nameOf).join(', ')} skipped this week`)
          }}
          onSelf={async () => {
            const p = overflow.plan
            setOverflow(null)
            const d = p.days.map((x, i) => (p.blocked.includes(i) || p.missed.includes(i) ? 'rest' : x))
            await saveWeek({ ...p, days: d, declined: true }, today)
            setShuffleKey((k) => k + 1)
            setToast('Tap any day above to set its workout')
          }}
        />
      )}
      {toast && createPortal(<div className="tr-toast" role="status">{toast}</div>, document.body)}
      {celebrate && day && <Celebration name={day.name} list={list} onClose={() => setCelebrate(false)} />}
    </section>
  )
}

/* ---------- Week strip: Mon–Sun, tap a day to change it ---------- */

function WeekStrip({ wp, ti, trained, todayId, shuffleKey, days, onOpen }: {
  wp: WeekPlan; ti: number; trained: Map<number, string>; todayId: string; shuffleKey: number
  days: Map<string, PlanDay>; onOpen: (i: number) => void
}) {
  return (
    <div className="tr-cycle" role="list" aria-label="This week">
      {wp.days.map((planned, i) => {
        const id = i === ti ? todayId : (trained.get(i) ?? planned)
        const rest = id === 'rest'
        const past = i < ti
        const missed = past && !trained.has(i) && wp.missed.includes(i) && !rest
        const label = rest ? (wp.blocked.includes(i) ? 'Off' : 'Rest') : (days.get(id)?.short ?? id)
        return (
          <button
            key={`${i}-${id}-${shuffleKey}`} role="listitem"
            className={`tr-slot${rest ? ' rest' : ''}${i === ti ? ' sel' : ''}${trained.has(i) ? ' ticked' : ''}${past ? ' past' : ''}${missed ? ' missed' : ''}`}
            style={{ animationDelay: `${i * 45}ms` }}
            onClick={() => onOpen(i)}
            aria-label={`${FULL_DAY[i]}: ${rest ? 'rest' : days.get(id)?.name ?? id}${trained.has(i) ? ', done' : ''}`}
          >
            <small>{WEEKDAYS[i][0]}</small>
            <span>{label}</span>
            <i aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function DaySheet({ i, wp, plan, isToday, locked, from, onPick, onRest, onReset, onClose }: {
  i: number; wp: WeekPlan; plan: PlanDay[]; isToday: boolean; locked: boolean; from: number
  onPick: (id: string) => void; onRest: () => void; onReset: () => void; onClose: () => void
}) {
  const current = wp.days[i]
  return createPortal(
    <div className="wd-backdrop" onClick={onClose}>
      <div className="wd-sheet ds-sheet" role="dialog" aria-label={`${FULL_DAY[i]} workout`} onClick={(e) => e.stopPropagation()}>
        <span className="wd-grab" aria-hidden />
        <h2 className="wd-title">{isToday ? 'Today' : FULL_DAY[i]}</h2>
        {locked ? (
          <p className="ds-note">This day has passed. Past days stay as you trained them.</p>
        ) : (
          <>
            <p className="ds-note">Pick a workout. If it&apos;s on another day, the two swap.</p>
            <div className="ds-grid">
              {plan.map((d, k) => {
                const on = findFrom(wp.days, d.id, from)
                return (
                  <button key={d.id} className={`ds-opt${current === d.id ? ' on' : ''}`} style={{ animationDelay: `${k * 30}ms` }} onClick={() => onPick(d.id)}>
                    <strong>{d.name}</strong>
                    <small>{current === d.id ? 'This day' : on >= 0 ? `Now on ${WEEKDAYS[on]}` : wp.dropped.includes(d.id) ? 'Skipped' : 'Not planned'}</small>
                  </button>
                )
              })}
            </div>
            <button className="ds-rest" onClick={onRest}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
              {current === 'rest' ? 'Keep as rest day' : "Can't train · reshuffle the week"}
            </button>
          </>
        )}
        <div className="wd-actions">
          <button onClick={onReset}>Reset week</button>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function OverflowSheet({ names, onSkip, onSelf }: { names: string[]; onSkip: () => void; onSelf: () => void }) {
  return createPortal(
    <div className="wd-backdrop">
      <div className="wd-sheet ds-sheet" role="alertdialog" aria-label="Week is full">
        <span className="wd-grab" aria-hidden />
        <h2 className="wd-title">Not enough days left</h2>
        <p className="ds-note">
          Everything can&apos;t fit before Sunday without moving into next week.
          Skip <strong>{names.join(' and ')}</strong> this week?
        </p>
        <div className="wd-actions">
          <button onClick={onSelf}>I&apos;ll edit it</button>
          <button className="primary" onClick={onSkip}>Skip {names.join(' + ')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Summary: straight on the page, like Today ---------- */

function Hero({ day, list, done, finished, nextName }: { day: PlanDay; list: Exercise[]; done: number; finished: boolean; nextName?: string }) {
  const total = list.length
  const fill = useFill(total ? done / total : 0)
  const shown = useCountUp(finished ? volumeKg(list) : done, finished ? 1000 : 500)
  const sets = list.reduce((t, e) => t + e.sets, 0)
  return (
    <div className={`tr-sum${finished ? ' finished' : ''}`}>
      <span className="tr-day">{finished && <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}{day.name}</span>
      {finished ? (
        <>
          <p className="td-big">{fmt(shown)}</p>
          <p className="td-cap">kg lifted <span>· workout complete</span></p>
        </>
      ) : (
        <>
          <p className="td-big">{Math.round(shown)}<span className="tr-of">/{total}</span></p>
          <p className="td-cap">exercises done <span>· {sets} sets</span></p>
        </>
      )}
      <div className="td-bar tr-bar" role="progressbar" aria-label="Exercises done" aria-valuenow={done} aria-valuemax={total}>
        <span style={{ width: `${fill * 100}%` }} />
      </div>
      {nextName && <p className="tr-upnext">Up next · {nextName}</p>}
    </div>
  )
}

/* ---------- Rest day ---------- */

function RestCard({ nextName, onTrain }: { nextName?: string; onTrain?: () => void }) {
  return (
    <div className="tr-sum tr-restday">
      <span className="tr-day rest">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
        Rest day
      </span>
      <p className="tr-rest-title">Recover today.</p>
      <p className="td-cap"><span>Muscles grow on the days off.</span></p>
      {nextName && <p className="tr-upnext">Next workout · {nextName}</p>}
      {onTrain && (
        <div className="td-list td-actions tr-rest-actions">
          <button className="td-addrow" onClick={onTrain}><span aria-hidden="true">+</span>Train today instead</button>
        </div>
      )}
    </div>
  )
}

/* ---------- One exercise ---------- */

function weightText(e: Exercise) {
  const w = e.dropWeight ? `${fmtWeight(e.weight)} → ${fmtWeight(e.dropWeight)}` : fmtWeight(e.weight)
  return `${w} ${e.unit}`
}

function ExerciseCard({ e, index, done, editing, onToggle, onRemove }: {
  e: Exercise; index: number; done: boolean; editing: boolean; onToggle: () => void; onRemove: () => void
}) {
  const [form, setForm] = useState(false)
  // Weight before a level change, while the card animation shows.
  const [lvl, setLvl] = useState<{ dir: 'up' | 'down'; from: number } | null>(null)
  const [dial, setDial] = useState<DialMode | null>(null)
  const [pop, setPop] = useState(false)
  useEffect(() => {
    if (lvl === null) return
    const t = window.setTimeout(() => setLvl(null), 2600)
    return () => window.clearTimeout(t)
  }, [lvl])

  const check = () => {
    if (!done) { setPop(true); window.setTimeout(() => setPop(false), 600) }
    onToggle()
  }
  const saveDial = async (weight: number, nextWeight: number | undefined) => {
    const from = e.weight
    await saveExercise(applyWeights(e, weight, nextWeight))
    setDial(null)
    if (weight !== from) setLvl({ dir: weight > from ? 'up' : 'down', from })
  }

  return (
    <li className={`tr-ex${done ? ' done' : ''}${lvl ? ` lvl ${lvl.dir}` : ''}`} style={{ animationDelay: `${80 + index * 45}ms` }}>
      <div className="tr-ex-main">
        {!editing ? (
          <button className={`tr-check${done ? ' on' : ''}${pop ? ' pop' : ''}`} onClick={check} aria-pressed={done} aria-label={`${e.name} ${done ? 'done' : 'not done'}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </button>
        ) : (
          <button className="tr-remove" onClick={onRemove} aria-label={`Remove ${e.name} from this day`}>−</button>
        )}
        <button className="tr-ex-text" onClick={editing ? () => setForm((v) => !v) : check}>
          <strong>{e.name}</strong>
          <span className="tr-meta"><b>{e.sets} × {e.reps || 'failure'}</b>{editing && <span>{weightText(e)}</span>}</span>
        </button>
        {editing ? (
          <span className="tr-chev" aria-hidden>{form ? '⌃' : '›'}</span>
        ) : (
          <button className="tr-wpill" onClick={() => setDial('now')} aria-label={`${e.name} weight ${weightText(e)}, tap to change`}>
            <span key={e.weight} className={`tr-w ${lvl?.dir ?? 'up'}`}>{weightText(e)}</span>
            <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden><path d="M2 5l3-3 3 3M2 9l3 3 3-3" /></svg>
          </button>
        )}
      </div>
      {lvl && (
        <div className={`tr-lvl-badge ${lvl.dir}`}>
          Level {lvl.dir} · {fmtWeight(lvl.from)} → {fmtWeight(e.weight)} {e.unit}
        </div>
      )}
      {!editing && <Overload e={e} onLevelUp={(from) => setLvl({ dir: 'up', from })} onEditGoal={() => setDial('next')} />}
      {editing && form && <ExerciseForm e={e} onDone={() => setForm(false)} />}
      {dial && <WeightDial e={e} start={dial} onClose={() => setDial(null)} onSave={saveDial} />}
    </li>
  )
}

/* ---------- Progressive overload: the heavier weight you're working towards ---------- */

function Overload({ e, onLevelUp, onEditGoal }: { e: Exercise; onLevelUp: (from: number) => void; onEditGoal: () => void }) {
  const [open, setOpen] = useState(false)
  const [reps, setReps] = useState(e.next?.reps ?? 0)
  // Cancel: one tap when nothing is logged yet; with reps logged, the x first asks "Cancel?" for 3s.
  const [ask, setAsk] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (!ask) return
    const id = window.setTimeout(() => setAsk(false), 3000)
    return () => window.clearTimeout(id)
  }, [ask])

  if (!e.next) {
    if (!e.reps) return null
    return <button className="tr-try" onClick={() => saveExercise(startAttempt(e))}>+ Try heavier</button>
  }
  const cancel = () => {
    if (leaving) return
    if (e.next?.reps && !ask) return setAsk(true)
    setAsk(false)
    setLeaving(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Let the drain + fold play out, then drop the goal.
    window.setTimeout(async () => { await saveExercise(cancelAttempt(e)); setLeaving(false); setOpen(false) }, reduced ? 0 : 560)
  }
  const target = e.reps || 1
  const n = Math.min(open ? reps : e.next.reps, target)
  const save = async () => {
    const r = recordAttempt(e, reps)
    await saveExercise(r.exercise)
    setOpen(false)
    if (r.leveledUp) onLevelUp(r.from)
  }
  const hits = reps >= target

  return (
    <div className={`tr-ol${open ? ' open' : ''}${leaving ? ' leaving' : ''}`} style={{ '--n': target } as CSSProperties}>
      <div className="tr-ol-top">
      <button className="tr-ol-row" onClick={() => { setReps(e.next?.reps ?? 0); setOpen((v) => !v) }} aria-expanded={open}>
        <span className="tr-ol-w">
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
          {fmtWeight(e.next.weight)} {e.unit}
        </span>
        <span className="tr-ol-bar" style={{ '--n': target } as CSSProperties} aria-label={`${e.next.reps} of ${target} reps`}>
          {Array.from({ length: target }, (_, i) => (
            <i key={i} className={i < n ? 'on' : ''} style={{ animationDelay: leaving ? `${(target - 1 - i) * 22}ms` : `${200 + i * 40}ms` }} />
          ))}
        </span>
        <span className="tr-ol-n">{(open ? reps : e.next.reps) ? <><b>{open ? reps : e.next.reps}</b>/{target}</> : 'new'}</span>
      </button>
      <button className={`tr-ol-x${ask ? ' ask' : ''}`} onClick={cancel} aria-label={ask ? 'Tap again to cancel the heavier goal' : 'Cancel the heavier goal'}>
        <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        <span>Cancel?</span>
      </button>
      </div>
      {open && !leaving && (
        <div className="tr-ol-edit">
          <button className="tr-ol-goal" onClick={onEditGoal} aria-label="Change goal weight">Reps at <b>{fmtWeight(e.next.weight)}{e.unit}</b></button>
          <div className="tr-ol-step">
            <button onClick={() => setReps((r) => Math.max(0, r - 1))} aria-label="One rep less">−</button>
            <b key={reps}>{reps}</b>
            <button onClick={() => setReps((r) => r + 1)} aria-label="One rep more">+</button>
          </div>
          <button className={`primary small${hits ? ' tr-ol-go' : ''}`} onClick={save}>{hits ? 'Level up' : 'Save'}</button>
        </div>
      )}
    </div>
  )
}

/* ---------- Edit / add ---------- */

type Draft = { name: string; sets: string; reps: string; weight: string; unit: WeightUnit; drop: string; nextW: string; nextR: string }
const toDraft = (e?: Exercise): Draft => ({
  name: e?.name ?? '', sets: String(e?.sets ?? 3), reps: String(e?.reps ?? 10), weight: e ? String(e.weight) : '',
  unit: e?.unit ?? 'kg', drop: e?.dropWeight ? String(e.dropWeight) : '',
  nextW: e?.next ? String(e.next.weight) : '', nextR: e?.next ? String(e.next.reps) : '',
})
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

function fromDraft(d: Draft, base: Pick<Exercise, 'id'>): Exercise | null {
  const sets = num(d.sets), reps = num(d.reps), weight = num(d.weight), drop = num(d.drop), nw = num(d.nextW), nr = num(d.nextR)
  if (!d.name.trim() || !(sets > 0) || !(reps >= 0) || !(weight >= 0)) return null
  return {
    id: base.id, name: d.name.trim(), sets, reps, weight, unit: d.unit,
    dropWeight: drop > 0 ? drop : undefined,
    next: nw > 0 ? { weight: nw, reps: nr >= 0 ? nr : 0 } : undefined,
    updatedAt: Date.now(),
  }
}

function ExerciseForm({ e, onDone, onSave }: { e?: Exercise; onDone: () => void; onSave?: (x: Exercise) => Promise<void> }) {
  const [d, setD] = useState(() => toDraft(e))
  const set = (k: keyof Draft) => (ev: { target: { value: string } }) => setD({ ...d, [k]: ev.target.value })
  const [id] = useState(() => e?.id ?? `custom-${Date.now().toString(36)}`)
  const x = fromDraft(d, { id })
  const save = async () => {
    if (!x) return
    await (onSave ? onSave(x) : saveExercise(x))
    onDone()
  }
  return (
    <div className="tr-form">
      <label>Name<input value={d.name} onChange={set('name')} placeholder="e.g. Cable Crossover" /></label>
      <div className="grid4">
        <label>Sets<input inputMode="numeric" value={d.sets} onChange={set('sets')} /></label>
        <label>Reps<input inputMode="numeric" value={d.reps} onChange={set('reps')} placeholder="0 = fail" /></label>
        <label>Weight<input inputMode="decimal" value={d.weight} onChange={set('weight')} /></label>
        <label>Unit
          <select value={d.unit} onChange={set('unit')}><option value="kg">kg</option><option value="lbs">lbs</option></select>
        </label>
      </div>
      <div className="grid4">
        <label>Drop to<input inputMode="decimal" value={d.drop} onChange={set('drop')} placeholder="—" /></label>
        <label>Next wt<input inputMode="decimal" value={d.nextW} onChange={set('nextW')} placeholder="—" /></label>
        <label>Next reps<input inputMode="numeric" value={d.nextR} onChange={set('nextR')} placeholder="—" /></label>
      </div>
      <p className="tr-form-note">Reps 0 = to failure. Shared lifts update on every day.</p>
      <div className="row">
        <button className="small" onClick={onDone}>Cancel</button>
        <button className="primary small" disabled={!x} onClick={save}>Save</button>
      </div>
    </div>
  )
}

function AddExercise({ day }: { day: PlanDay }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button className="tr-add" onClick={() => setOpen(true)}>+ Add exercise to {day.short}</button>
  return (
    <div className="card tr-add-card">
      <ExerciseForm onDone={() => setOpen(false)} onSave={(x) => addExerciseToDay(day.id, x)} />
    </div>
  )
}

/* ---------- Day complete ---------- */

function Celebration({ name, list, onClose }: { name: string; list: Exercise[]; onClose: () => void }) {
  const vol = useCountUp(volumeKg(list), 1100, 900)
  const sets = list.reduce((t, e) => t + e.sets, 0)
  useEffect(() => {
    const t = window.setTimeout(onClose, 7000)
    return () => window.clearTimeout(t)
  }, [onClose])
  // Portal to <body>: the page's fade-in transform would otherwise trap this fixed overlay inside the page.
  return createPortal(
    <div className="tr-done" role="dialog" aria-label={`${name} complete`} onClick={onClose}>
      <div className="tr-burst">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ '--r': `${i * 30}deg`, animationDelay: `${520 + (i % 2) * 60}ms`, background: ['var(--kcal)', 'var(--protein)', 'var(--carbs)', 'var(--fat)'][i % 4] } as CSSProperties} />
        ))}
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r="58" className="tr-done-track" />
          <circle cx="66" cy="66" r="58" className="tr-done-ring" />
          <path d="M42 68l16 16 32-34" className="tr-done-check" />
        </svg>
      </div>
      <h2>{name} done</h2>
      <div className="tr-done-stats">
        <span><b>{list.length}</b>exercises</span>
        <span><b>{sets}</b>sets</span>
        <span><b>{fmt(vol)}</b>kg lifted</span>
      </div>
      <button className="primary" onClick={onClose}>Nice</button>
    </div>,
    document.body,
  )
}
