import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addExerciseToDay, deleteWeight, logWeight, removeExerciseFromDay, renamePlanDay, reorderDay, saveExercise, saveSettings, saveTrainingWeek } from '../db/repo'
import { exportBackup, parseBackup, restoreBackup } from '../db/backup'
import type { DayType, Exercise, Macros, PlanDay, Settings as SettingsT } from '../db/types'
import { addDays, formatDay } from '../logic/dates'
import { weeklyWeights } from '../logic/weight'
import { dayType } from '../logic/budget'
import { sum } from '../logic/macros'
import { DEFAULT_WEEK, WEEKDAYS, dayIndex, mondayOf } from '../logic/schedule'
import { applyWeights, fmtWeight } from '../logic/train'
import { getPass, setPass } from '../logic/ai'
import { searchByName } from '../logic/search'
import { useSettings } from '../ui/hooks'
import { useCountUp } from '../ui/motion'
import { WeightDial } from '../ui/WeightDial'
import type { ThemeMode } from '../ui/theme'

type PanelId = 'targets' | 'training' | 'weight' | 'ai' | 'look' | 'backup'
type Origin = { top: number; left: number; right: number; bottom: number }

const k = (v: number) => Math.round(v).toLocaleString('en-US')
const FULL_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface Props {
  today: string
  themeMode: ThemeMode
  onThemeMode: (m: ThemeMode) => void
  onOpenFoods: () => void
}

/** Settings = control centre: a live profile card, then one coloured tile per area that grows into its panel. */
export function Settings({ today, themeMode, onThemeMode, onOpenFoods }: Props) {
  const settings = useSettings()
  const week = mondayOf(today)
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []) ?? []
  const foodCount = useLiveQuery(() => db.foods.filter((f) => f.archived !== 1).count(), []) ?? 0
  const entries = useLiveQuery(() => db.entries.where('date').equals(today).toArray(), [today]) ?? []
  const overrides = useLiveQuery(() => db.days.toArray(), []) ?? []
  const wp = useLiveQuery(() => db.weeks.get(week), [week])
  const sessions = useLiveQuery(() => db.sessions.where('date').between(week, addDays(week, 6), true, true).toArray(), [week]) ?? []
  const plan = useLiveQuery(() => db.plan.orderBy('order').toArray(), []) ?? []
  const [open, setOpen] = useState<{ id: PanelId; origin: Origin } | null>(null)

  const type = dayType(today, overrides, settings)
  const eaten = sum(entries).kcal
  const target = settings.targets[type].kcal
  const latest = weights.at(-1)
  const weekAgo = weights.filter((w) => w.date <= addDays(today, -7)).at(-1)
  const delta = latest && weekAgo ? Math.round((latest.kg - weekAgo.kg) * 10) / 10 : null
  const trainDays = (wp?.days ?? DEFAULT_WEEK).map((d, i) => ({ d, i })).filter((x) => x.d !== 'rest')
  const doneIdx = new Set(sessions.filter((s) => s.finishedAt).map((s) => dayIndex(week, s.date)))
  const ti = dayIndex(week, today)
  const startIdx = wp ? Math.max(0, dayIndex(week, wp.startedOn)) : ti
  const todayPlan = wp?.days[ti]
  const todayName = todayPlan && todayPlan !== 'rest' ? plan.find((p) => p.id === todayPlan)?.name : 'Rest day'
  const pass = getPass() // localStorage read; re-evaluated on every render (e.g. after the AI panel closes)

  const openPanel = (id: PanelId) => (e: { currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    setOpen({ id, origin: { top: r.top, left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom } })
  }

  return (
    <section className="td st">
      <header className="td-head">
        <div className="td-date">
          <h1>Settings</h1>
          <span>Everything in one place</span>
        </div>
      </header>

      <ProfileCard
        name={settings.name || 'Mahmoud'}
        kg={latest?.kg} delta={delta} spark={weights.slice(-12).map((w) => w.kg)}
        eaten={eaten} target={target}
        trainDays={trainDays.map((x) => ({ done: doneIdx.has(x.i), today: x.i === ti, past: x.i < ti && x.i >= startIdx }))}
      />

      <h3 className="st-group-h">Plan</h3>
      <div className="td-list st-rows">
        <Row tone="kcal" delay={0} onOpen={openPanel('targets')}
          icon={<path d="M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1" />}
          title="Targets" sub={`Training ${k(settings.targets.training.kcal)} · Rest ${k(settings.targets.rest.kcal)} kcal`} />
        <Row tone="carbs" delay={1} onOpen={openPanel('training')}
          icon={<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />}
          title="Training" sub={`Today · ${todayName ?? 'Rest'}`} value={`${doneIdx.size}/${trainDays.length}`} />
        <Row tone="protein" delay={2} onOpen={openPanel('weight')}
          icon={<><rect x="3.5" y="4" width="17" height="16" rx="4" /><path d="M8.5 9.5a5 5 0 0 1 7 0L12 13" /></>}
          title="Weight" value={latest ? `${fmtWeight(latest.kg)} kg` : undefined}
          sub={delta === null ? (latest ? `Last ${formatDay(latest.date, { day: 'numeric', month: 'short' })}` : 'Log your first weigh-in') : `${delta > 0 ? '+' : ''}${delta} kg this week`} />
      </div>

      <h3 className="st-group-h">Food</h3>
      <div className="td-list st-rows">
        <Row tone="fat" delay={3} onOpen={onOpenFoods}
          icon={<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" />}
          title="My foods" sub="Open, edit or add" value={String(foodCount)} />
        <Row tone="ai" delay={4} onOpen={openPanel('ai')}
          icon={<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />}
          title="AI" sub="Estimates and label scans" value={pass ? 'Connected' : 'Set passcode'} />
      </div>

      <h3 className="st-group-h">App</h3>
      <div className="td-list st-rows">
        <Row tone="look" delay={5} onOpen={openPanel('look')}
          icon={<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" /></>}
          title="Look" sub="Theme and greeting name" value={themeMode === 'auto' ? 'Auto' : themeMode === 'dark' ? 'Dark' : 'Light'} />
        <Row tone="teal" delay={6} onOpen={openPanel('backup')}
          icon={<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5M12 12v8M9 17l3 3 3-3" />}
          title="Backup" sub="Export or restore your data" />
      </div>
      <p className="st-foot">RepFuel · your data stays on this phone</p>

      {open && (
        <Panel
          origin={open.origin} tone={TONES[open.id]} title={TITLES[open.id]}
          onClose={() => setOpen(null)}
        >
          {open.id === 'targets' && <TargetsPanel settings={settings} />}
          {open.id === 'weight' && <WeightPanel today={today} settings={settings} />}
          {open.id === 'training' && <TrainingPanel today={today} settings={settings} plan={plan} />}
          {open.id === 'ai' && <AiPanel />}
          {open.id === 'look' && <LookPanel settings={settings} mode={themeMode} onMode={onThemeMode} />}
          {open.id === 'backup' && <BackupPanel />}
        </Panel>
      )}
    </section>
  )
}

const TONES: Record<PanelId, string> = { targets: 'kcal', training: 'carbs', weight: 'protein', ai: 'ai', look: 'look', backup: 'teal' }
const TITLES: Record<PanelId, string> = { targets: 'Targets', training: 'Training', weight: 'Weight', ai: 'AI', look: 'Look', backup: 'Backup' }

/* ---------- Profile card ---------- */

function ProfileCard({ name, kg, delta, spark, eaten, target, trainDays }: {
  name: string; kg?: number; delta: number | null; spark: number[]; eaten: number; target: number
  trainDays: { done: boolean; today: boolean; past: boolean }[]
}) {
  const ratio = target ? Math.min(1, eaten / target) : 0
  const v = useCountUp(ratio, 900, 200)
  const shown = useCountUp(eaten, 900, 200)
  const R = 21, C = 2 * Math.PI * R
  return (
    <div className="st-profile">
      <div className="st-avatar" aria-hidden>{name.trim()[0]?.toUpperCase() ?? 'M'}</div>
      <div className="st-who">
        <strong>{name}</strong>
        <span>{kg ? <>{fmtWeight(kg)} kg{delta !== null && <i className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {Math.abs(delta)}</i>}</> : 'No weigh-ins yet'}</span>
      </div>
      <Spark values={spark} />
      <div className="st-stats">
        <div className="st-stat">
          <svg width="50" height="50" viewBox="0 0 50 50" className="st-mini">
            <circle cx="25" cy="25" r={R} className="st-mini-track" />
            {v > 0.003 && <circle cx="25" cy="25" r={R} className="st-mini-arc" strokeDasharray={`${v * C} ${C}`} />}
          </svg>
          <div><b>{k(shown)}</b><small>of {k(target)} kcal</small></div>
        </div>
        <div className="st-stat">
          <div className="st-dots" aria-label={`${trainDays.filter((d) => d.done).length} of ${trainDays.length} workouts done this week`}>
            {trainDays.map((d, i) => (
              <span key={i} className={`${d.done ? 'on' : ''}${d.today ? ' now' : ''}${d.past && !d.done ? ' miss' : ''}`} style={{ animationDelay: `${300 + i * 60}ms` }} />
            ))}
          </div>
          <div><b>{trainDays.filter((d) => d.done).length}/{trainDays.length}</b><small>workouts</small></div>
        </div>
      </div>
    </div>
  )
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="st-spark empty" aria-hidden />
  const W = 92, H = 34
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 8)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts.at(-1)!
  return (
    <svg className="st-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} className="st-spark-fill" />
      <path d={d} className="st-spark-line" pathLength={1} />
      <circle cx={lx} cy={ly} r="3" className="st-spark-dot" />
    </svg>
  )
}

/* ---------- Row: iOS-style setting row, opens its panel ---------- */

function Row({ tone, icon, title, sub, value, delay, onOpen }: {
  tone: string; icon: ReactNode; title: string; sub: string; value?: string
  delay: number; onOpen: (e: { currentTarget: HTMLElement }) => void
}) {
  return (
    <button
      className={`st-row-btn t-${tone}`}
      style={{ animationDelay: `${80 + delay * 40}ms` }}
      onClick={onOpen} aria-label={`${title}: ${value ?? ''} ${sub}`}
    >
      <span className="st-ico">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      </span>
      <span className="st-row-text">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      {value && <span className="st-row-val">{value}</span>}
      <svg className="st-row-chev" width="8" height="13" viewBox="0 0 8 13" aria-hidden><path d="M1.5 1.5l5 5-5 5" /></svg>
    </button>
  )
}

function Panel({ origin, tone, title, onClose, children }: { origin: Origin; tone: string; title: string; onClose: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false)
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const close = () => setClosing(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [])
  const touch = {
    onTouchStart: (e: TouchEvent) => { start.current = e.touches[0].clientY },
    onTouchMove: (e: TouchEvent) => { if (start.current !== null) setDrag(Math.max(0, e.touches[0].clientY - start.current)) },
    onTouchEnd: () => { if (drag > 90) close(); else setDrag(0); start.current = null },
  }
  const vars = {
    '--o-t': `${origin.top}px`, '--o-l': `${origin.left}px`, '--o-r': `${origin.right}px`, '--o-b': `${origin.bottom}px`,
    transform: drag ? `translateY(${drag}px) scale(${1 - Math.min(drag, 300) / 3000})` : undefined,
    borderRadius: drag ? 28 : undefined,
  } as CSSProperties
  return createPortal(
    <div className={`st-scrim${closing ? ' out' : ''}`} onClick={close}>
      <div
        className={`st-panel t-${tone}${closing ? ' closing' : ''}${drag ? ' dragging' : ''}`} style={vars}
        role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClose() }}
      >
        <header className="st-panel-head" {...touch}>
          <span className="wd-grab" aria-hidden />
          <div className="st-panel-bar">
            <h2>{title}</h2>
            <button className="st-close" onClick={close} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>
        <div className="st-panel-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function Saved({ show, label = 'Saved' }: { show: boolean; label?: string }) {
  return show ? (
    <span className="st-saved" role="status">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{label}
    </span>
  ) : null
}

/* ---------- Targets ---------- */

const MACRO_ROWS = [
  { key: 'protein', label: 'Protein', kcal: 4, max: 300, color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', kcal: 4, max: 500, color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', kcal: 9, max: 150, color: 'var(--fat)' },
] as const

function TargetsPanel({ settings }: { settings: SettingsT }) {
  const [draft, setDraft] = useState(settings)
  const [type, setType] = useState<DayType>('training')
  const [saved, setSaved] = useState(false)
  const t = draft.targets[type]
  const set = (key: keyof Macros, v: number) => {
    setDraft({ ...draft, targets: { ...draft.targets, [type]: { ...t, [key]: Math.max(0, Math.round(v)) } } })
    setSaved(false)
  }
  const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9
  const gap = fromMacros - t.kcal
  const shares = MACRO_ROWS.map((m) => (fromMacros ? (t[m.key] * m.kcal) / fromMacros : 0))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const kcalShown = useCountUp(t.kcal, 350)

  return (
    <div className="st-targets">
      <div className="unit-seg" role="radiogroup" style={{ '--n': 2, '--i': type === 'training' ? 0 : 1 } as CSSProperties}>
        <span className="unit-thumb" aria-hidden />
        <button role="radio" aria-checked={type === 'training'} onClick={() => setType('training')}>Training day</button>
        <button role="radio" aria-checked={type === 'rest'} onClick={() => setType('rest')}>Rest day</button>
      </div>

      <div className="st-kcal" key={type}>
        <button onClick={() => set('kcal', t.kcal - 50)} aria-label="50 kcal less">−</button>
        <div>
          <input
            inputMode="numeric" value={t.kcal} aria-label="Calories"
            onChange={(e) => set('kcal', Number(e.target.value.replace(/\D/g, '')) || 0)}
            style={{ opacity: 0, position: 'absolute', inset: 0 }}
          />
          <strong>{k(kcalShown)}</strong>
          <small>kcal a day</small>
        </div>
        <button onClick={() => set('kcal', t.kcal + 50)} aria-label="50 kcal more">+</button>
      </div>

      <div className="st-split" aria-hidden>
        {MACRO_ROWS.map((m, i) => <span key={m.key} style={{ flexGrow: shares[i] || 0.0001, background: m.color }} />)}
      </div>

      <div className="st-macros">
        {MACRO_ROWS.map((m) => (
          <div key={m.key} className="st-macro" style={{ '--c': m.color, '--p': `${Math.min(100, (t[m.key] / m.max) * 100)}%` } as CSSProperties}>
            <div className="st-macro-head">
              <span><i />{m.label}</span>
              <span className="st-macro-num">
                <input inputMode="numeric" value={t[m.key]} aria-label={`${m.label} grams`} onChange={(e) => set(m.key, Number(e.target.value.replace(/\D/g, '')) || 0)} />g
                <small>{k(t[m.key] * m.kcal)} kcal</small>
              </span>
            </div>
            <input type="range" min={0} max={m.max} step={5} value={t[m.key]} onChange={(e) => set(m.key, Number(e.target.value))} aria-label={`${m.label} slider`} />
          </div>
        ))}
      </div>

      <p className={`st-check ${Math.abs(gap) <= 50 ? 'ok' : 'off'}`}>
        {Math.abs(gap) <= 50
          ? <>Macros add up to <b>{k(fromMacros)}</b> kcal ✓</>
          : <>Macros add up to <b>{k(fromMacros)}</b> kcal, {k(Math.abs(gap))} {gap > 0 ? 'over' : 'under'} your target. <button className="link" onClick={() => set('kcal', fromMacros)}>Use {k(fromMacros)}</button></>}
      </p>

      <div className="st-row">
        <span>Reference weight</span>
        <span className="st-inline">
          <input inputMode="decimal" value={draft.referenceWeightKg} onChange={(e) => { setDraft({ ...draft, referenceWeightKg: Number(e.target.value) || 0 }); setSaved(false) }} aria-label="Reference weight kg" /> kg
        </span>
      </div>

      <div className="st-actions">
        <Saved show={saved} />
        <button className="primary" disabled={!dirty} onClick={async () => { await saveSettings(draft); setSaved(true) }}>Save targets</button>
      </div>
    </div>
  )
}

/* ---------- Weight ---------- */

function WeightPanel({ today, settings }: { today: string; settings: SettingsT }) {
  const logs = useLiveQuery(() => db.weights.orderBy('date').toArray(), []) ?? []
  const latest = logs.at(-1)
  const [kg, setKg] = useState<number | null>(null)
  const [date, setDate] = useState(today)
  const [saved, setSaved] = useState(false)
  const [all, setAll] = useState(false)
  const value = kg ?? latest?.kg ?? settings.referenceWeightKg
  const weeks = weeklyWeights(logs, settings.referenceWeightKg).slice(0, 6)
  const step = (d: number) => { setKg(Math.round((value + d) * 10) / 10); setSaved(false) }

  return (
    <div className="st-weight">
      <WeightChart logs={logs.slice(-30)} reference={settings.referenceWeightKg} />

      <div className="st-log">
        <div className="st-kcal st-kg">
          <button onClick={() => step(-0.1)} aria-label="0.1 kg less">−</button>
          <div>
            <strong key={value}>{value.toFixed(1)}</strong>
            <small>kg</small>
          </div>
          <button onClick={() => step(0.1)} aria-label="0.1 kg more">+</button>
        </div>
        <div className="st-row">
          <span>Date</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Weigh-in date" className="st-date" />
        </div>
        <div className="st-actions">
          <Saved show={saved} label="Logged" />
          <button className="primary" onClick={async () => { if (value > 20 && value < 300) { await logWeight(date, value); setSaved(true); setKg(null) } }}>Log weigh-in</button>
        </div>
      </div>

      {weeks.length > 0 && (
        <>
          <h3 className="st-h">Weekly average</h3>
          <ul className="st-list">
            {weeks.map((w, i) => (
              <li key={w.weekStart} style={{ animationDelay: `${i * 40}ms` }}>
                <span>Week of {formatDay(w.weekStart, { day: 'numeric', month: 'short' })}<small>{w.count} weigh-in{w.count > 1 ? 's' : ''}</small></span>
                <span className="st-list-val"><b>{w.avgKg}</b> kg<small className={w.vsReference > 0 ? 'up' : 'down'}>{w.vsReference >= 0 ? '+' : ''}{w.vsReference}</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {logs.length > 0 && (
        <>
          <button className="st-more" onClick={() => setAll((v) => !v)}>{all ? 'Hide' : 'Show'} all weigh-ins ({logs.length})</button>
          {all && (
            <ul className="st-list">
              {[...logs].reverse().map((l) => (
                <li key={l.date}>
                  <span>{formatDay(l.date)}</span>
                  <span className="st-list-val"><b>{l.kg}</b> kg <button className="st-del" onClick={() => deleteWeight(l.date)} aria-label={`Delete ${l.date}`}>Delete</button></span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function WeightChart({ logs, reference }: { logs: { date: string; kg: number }[]; reference: number }) {
  if (logs.length < 2) {
    return <div className="st-chart empty"><p>Log two weigh-ins to see your trend.</p></div>
  }
  const W = 320, H = 130, P = 10
  const vals = [...logs.map((l) => l.kg), reference]
  const min = Math.min(...vals) - 0.3, max = Math.max(...vals) + 0.3
  const x = (i: number) => P + (i / (logs.length - 1)) * (W - 2 * P)
  const y = (v: number) => P + (1 - (v - min) / (max - min)) * (H - 2 * P)
  const d = logs.map((l, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(l.kg).toFixed(1)}`).join(' ')
  return (
    <div className="st-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Weight trend">
        <line x1={0} x2={W} y1={y(reference)} y2={y(reference)} className="st-chart-ref" />
        <path d={`${d} L${x(logs.length - 1)} ${H} L${x(0)} ${H} Z`} className="st-chart-fill" />
        <path d={d} className="st-chart-line" pathLength={1} />
        {logs.map((l, i) => <circle key={l.date} cx={x(i)} cy={y(l.kg)} r={i === logs.length - 1 ? 4 : 2.2} className="st-chart-dot" style={{ animationDelay: `${600 + i * 20}ms` }} />)}
      </svg>
      <div className="st-chart-legend">
        <span>{formatDay(logs[0].date, { day: 'numeric', month: 'short' })}</span>
        <span className="st-ref">— {reference} kg reference</span>
        <span>{formatDay(logs.at(-1)!.date, { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  )
}

/* ---------- Training ---------- */

function TrainingPanel({ today, settings, plan }: { today: string; settings: SettingsT; plan: PlanDay[] }) {
  const base = settings.trainingWeek ?? DEFAULT_WEEK
  const [days, setDays] = useState(base)
  const [pick, setPick] = useState<number | null>(null)
  const [thisWeek, setThisWeek] = useState(true)
  const [saved, setSaved] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const short = (id: string) => (id === 'rest' ? 'Rest' : plan.find((p) => p.id === id)?.short ?? id)
  const dirty = days.join() !== base.join()
  const count = (id: string) => days.filter((d) => d === id).length
  const missing = plan.filter((p) => !days.includes(p.id))
  const opened = plan.find((p) => p.id === openDay)
  if (opened) {
    const i = plan.indexOf(opened)
    return <DayPage key={opened.id} day={opened} tone={DAY_TONES[i % DAY_TONES.length]} plan={plan} exercises={exercises}
      on={days.flatMap((d, j) => (d === opened.id ? [WEEKDAYS[j]] : []))} onBack={() => setOpenDay(null)} />
  }

  return (
    <div className="st-training">
      <h3 className="st-h">Your normal week</h3>
      <div className="st-week">
        {days.map((d, i) => (
          <button key={i} className={`st-wday${d === 'rest' ? ' rest' : ''}${pick === i ? ' sel' : ''}`} onClick={() => setPick(pick === i ? null : i)} aria-label={`${FULL_DAY[i]}: ${short(d)}`}>
            <small>{WEEKDAYS[i][0]}</small>
            <span key={d}>{short(d)}</span>
          </button>
        ))}
      </div>
      {pick !== null && (
        <div className="st-picker" key={pick}>
          <span>{FULL_DAY[pick]}</span>
          <div>
            {[...plan.map((p) => p.id), 'rest'].map((id, j) => (
              <button key={id} className={days[pick] === id ? 'on' : ''} style={{ animationDelay: `${j * 25}ms` }}
                onClick={() => { const n = [...days]; n[pick] = id; setDays(n); setSaved(false); setPick(null) }}>
                {short(id)}
              </button>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && <p className="st-warn">Not in the week: {missing.map((m) => m.short).join(', ')}</p>}
      {plan.some((p) => count(p.id) > 1) && <p className="st-warn">Some workouts are on two days.</p>}
      <label className="st-toggle">
        <input type="checkbox" checked={thisWeek} onChange={(e) => setThisWeek(e.target.checked)} />
        <span aria-hidden />
        Also change the rest of this week
      </label>
      <div className="st-actions">
        <Saved show={saved} />
        <button className="small" disabled={days.join() === DEFAULT_WEEK.join()} onClick={() => { setDays(DEFAULT_WEEK); setSaved(false) }}>Default</button>
        <button className="primary" disabled={!dirty} onClick={async () => { await saveTrainingWeek(days, thisWeek, today); setSaved(true) }}>Save week</button>
      </div>
      <p className="st-note">Rest days here also set your rest-day calorie targets.</p>

      <h3 className="st-h">Workout days <span>{plan.length}</span></h3>
      <div className="st-days">
        {plan.map((p, i) => {
          const list = p.exerciseIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e)
          const on = days.flatMap((d, j) => (d === p.id ? [WEEKDAYS[j]] : []))
          return (
            <button key={p.id} className="st-day" style={{ '--dc': DAY_TONES[i % DAY_TONES.length], animationDelay: `${i * 45}ms` } as CSSProperties} onClick={() => setOpenDay(p.id)}>
              <span className="st-day-top">
                <b className="st-day-chip">{p.short}</b>
                <small className={on.length ? '' : 'off'}>{on.length ? on.join(' · ') : 'Not in your week'}</small>
              </span>
              <strong>{p.name}</strong>
              <span className="st-day-meta">{list.length} exercises · {list.reduce((t, e) => t + e.sets, 0)} sets</span>
              <span className="st-day-peek">{list.slice(0, 3).map((e) => e.name).join(', ')}{list.length > 3 ? ` +${list.length - 3}` : ''}</span>
              <svg className="st-day-go" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          )
        })}
      </div>
      <p className="st-note">Tap a day to rename it and edit its exercises.</p>
    </div>
  )
}

const DAY_TONES = ['var(--protein)', 'var(--kcal)', 'var(--carbs)', 'var(--fat)', 'var(--ai)', 'var(--teal)']

/** One workout day, opened from its card: rename it, then edit, reorder, add or remove its exercises. */
function DayPage({ day, tone, plan, exercises, on, onBack }: { day: PlanDay; tone: string; plan: PlanDay[]; exercises: Exercise[]; on: string[]; onBack: () => void }) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const list = day.exerciseIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e)
  const [name, setName] = useState(day.name)
  const [short, setShort] = useState(day.short)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [reorder, setReorder] = useState(false)
  const [adding, setAdding] = useState(false)
  const [dial, setDial] = useState<Exercise | null>(null)
  const alsoOn = (id: string) => plan.filter((p) => p.id !== day.id && p.exerciseIds.includes(id)).map((p) => p.short)

  useEffect(() => { document.querySelector('.st-panel-body')?.scrollTo({ top: 0 }) }, [])
  useEffect(() => {
    if (!saved) return
    const id = window.setTimeout(() => setSaved(false), 1400)
    return () => window.clearTimeout(id)
  }, [saved])

  // Names save when you leave the field (or press Return); empty names snap back.
  const commit = async () => {
    const n = name.trim(), sh = short.trim().slice(0, 6)
    if (!n || !sh) { setName(day.name); setShort(day.short); return }
    if (n === day.name && sh === day.short) return
    await renamePlanDay(day.id, n, sh)
    setSaved(true)
  }
  const blurOnEnter = (ev: { key: string; currentTarget: HTMLInputElement }) => { if (ev.key === 'Enter') ev.currentTarget.blur() }
  const move = (i: number, d: number) => {
    const ids = list.map((e) => e.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorderDay(day.id, ids)
  }

  return (
    <div className="st-dpage" style={{ '--dc': tone } as CSSProperties}>
      <button className="st-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        Workout days
      </button>

      <div className="st-dhero">
        <label className="st-dtitle">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={blurOnEnter} aria-label="Workout day name" enterKeyHint="done" autoComplete="off" />
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
        </label>
        <div className="st-dsub">
          <label className="st-dchip" title="Short name (max 6)">
            <input value={short} maxLength={6} onChange={(e) => setShort(e.target.value)} onBlur={commit} onKeyDown={blurOnEnter} aria-label="Short name, up to 6 letters" enterKeyHint="done" autoComplete="off" />
          </label>
          <span>{on.length ? on.join(' · ') : 'Not in your week'} · {list.length} exercises · {list.reduce((t, e) => t + e.sets, 0)} sets</span>
          <span className={`st-dsaved${saved ? ' on' : ''}`} aria-live="polite">{saved ? 'Saved' : ''}</span>
        </div>
      </div>

      <div className="st-dbar">
        <h3 className="st-h">Exercises</h3>
        {list.length > 1 && <button className={`st-dlink${reorder ? ' on' : ''}`} onClick={() => { setReorder((v) => !v); setEditing(null) }}>{reorder ? 'Done' : 'Reorder'}</button>}
      </div>
      {list.length ? (
        <ul className={`st-dlist${reorder ? ' reorder' : ''}`}>
          {list.map((e, i) => {
            const shared = alsoOn(e.id)
            return (
              <li key={e.id} className={editing === e.id ? 'open' : ''} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                {editing === e.id ? (
                  <ExerciseEditor e={e} dayShort={day.short} shared={shared} onClose={() => setEditing(null)}
                    onRemove={async () => { await removeExerciseFromDay(day.id, e.id); setEditing(null) }} />
                ) : (
                  <>
                    <span className="st-dnum">{i + 1}</span>
                    <button className="st-dname" onClick={() => !reorder && setEditing(e.id)} aria-label={`Edit ${e.name}`}>
                      <b>{e.name}</b>
                      <small>{e.sets} × {e.reps || 'failure'}{shared.length > 0 && <i>also {shared.join(', ')}</i>}</small>
                    </button>
                    {reorder ? (
                      <span className="st-dmove">
                        <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${e.name} up`}><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg></button>
                        <button onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move ${e.name} down`}><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
                      </span>
                    ) : (
                      <button className="tr-wpill" onClick={() => setDial(e)} aria-label={`${e.name} weight, tap to change`}>
                        <span key={e.weight} className="tr-w">{fmtWeight(e.weight)} {e.unit}</span>
                        {e.next && <small className="st-goal">→ {fmtWeight(e.next.weight)}</small>}
                      </button>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="st-dempty">No exercises yet. Add the first one below.</p>
      )}

      {adding ? <AddToDay day={day} exercises={exercises} plan={plan} onDone={() => setAdding(false)} />
        : <button className="st-dadd" onClick={() => { setAdding(true); setReorder(false) }}>+ Add exercise</button>}

      {dial && (
        <WeightDial e={dial} start="now" onClose={() => setDial(null)}
          onSave={async (w, nw) => { await saveExercise(applyWeights(dial, w, nw)); setDial(null) }} />
      )}
    </div>
  )
}

function Mini({ label, value, min, onChange, show }: { label: string; value: number; min: number; onChange: (n: number) => void; show?: (n: number) => string }) {
  return (
    <div className="st-step">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Less ${label}`}>−</button>
        <b key={value}>{show ? show(value) : value}</b>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
      </div>
    </div>
  )
}

/** Inline editor for one exercise: rename and sets/reps. A shared lift changes on every day it's on. */
function ExerciseEditor({ e, dayShort, shared, onClose, onRemove }: { e: Exercise; dayShort: string; shared: string[]; onClose: () => void; onRemove: () => void }) {
  const [name, setName] = useState(e.name)
  const [sets, setSets] = useState(e.sets)
  const [reps, setReps] = useState(e.reps)
  const save = async () => {
    if (!name.trim()) return
    await saveExercise({ ...e, name: name.trim(), sets, reps })
    onClose()
  }
  return (
    <form className="st-dedit" onSubmit={(ev) => { ev.preventDefault(); save() }}>
      <input value={name} onChange={(ev) => setName(ev.target.value)} aria-label="Exercise name" enterKeyHint="done" autoComplete="off" />
      <div className="st-dedit-row">
        <Mini label="Sets" value={sets} min={1} onChange={setSets} />
        <Mini label="Reps" value={reps} min={0} onChange={setReps} show={(n) => (n ? String(n) : 'fail')} />
      </div>
      {shared.length > 0 && <p className="st-note">Also on {shared.join(', ')}, so it changes there too.</p>}
      <div className="st-dedit-actions">
        <button type="button" className="small danger" onClick={onRemove}>Remove from {dayShort}</button>
        <span />
        <button type="button" className="small" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary small" disabled={!name.trim()}>Save</button>
      </div>
    </form>
  )
}

/** Add an exercise: reuse one from another day (keeps its weight), or create a new one. */
function AddToDay({ day, exercises, plan, onDone }: { day: PlanDay; exercises: Exercise[]; plan: PlanDay[]; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(10)
  const [weight, setWeight] = useState('')
  const pool = exercises.filter((e) => !day.exerciseIds.includes(e.id))
  const hits = q.trim() ? searchByName(pool, q, 6) : []
  const exact = pool.some((e) => e.name.toLowerCase() === q.trim().toLowerCase())
  const where = (id: string) => plan.filter((p) => p.exerciseIds.includes(id)).map((p) => p.short).join(', ')
  const create = async () => {
    const n = q.trim()
    if (!n) return
    await addExerciseToDay(day.id, { id: `custom-${Date.now().toString(36)}`, name: n, sets, reps, weight: Number(weight) || 0, unit: 'kg', updatedAt: Date.now() })
    onDone()
  }
  return (
    <div className="st-dadd-card">
      <div className="st-dadd-head">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Exercise name, e.g. Cable Crossover" aria-label="Exercise name" autoFocus enterKeyHint="search" autoComplete="off" />
        <button className="small" onClick={onDone}>Cancel</button>
      </div>
      {hits.length > 0 && (
        <>
          <p className="st-dadd-label">From your other days</p>
          <div className="st-dadd-hits">
            {hits.map((e, i) => (
              <button key={e.id} style={{ animationDelay: `${i * 30}ms` }} onClick={async () => { await addExerciseToDay(day.id, e); onDone() }}>
                <b>{e.name}</b><small>{fmtWeight(e.weight)} {e.unit}{where(e.id) ? ` · ${where(e.id)}` : ''}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {q.trim() && !exact && (
        <div className="st-dnew">
          <p className="st-dadd-label">New exercise</p>
          <div className="st-dedit-row">
            <Mini label="Sets" value={sets} min={1} onChange={setSets} />
            <Mini label="Reps" value={reps} min={0} onChange={setReps} show={(n) => (n ? String(n) : 'fail')} />
            <label className="st-step st-dnew-w"><span>Weight</span><input inputMode="decimal" value={weight} placeholder="kg" onChange={(e) => setWeight(e.target.value)} aria-label="Weight in kg" /></label>
          </div>
          <button className="primary st-dnew-go" onClick={create}>Add “{q.trim()}” to {day.short}</button>
        </div>
      )}
    </div>
  )
}

/* ---------- AI ---------- */

function AiPanel() {
  const [value, setValue] = useState(getPass)
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const has = !!getPass()
  return (
    <div className="st-ai">
      <div className={`st-status ${has ? 'ok' : 'off'}`}>
        <span />
        {has ? 'Ask AI and Scan label are ready' : 'Add the passcode to use Ask AI and Scan label'}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setPass(value.trim()); setSaved(true) }}>
        <div className="st-pass">
          <input type={show ? 'text' : 'password'} autoComplete="off" placeholder="AI passcode" value={value} onChange={(e) => { setValue(e.target.value); setSaved(false) }} aria-label="AI passcode" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide passcode' : 'Show passcode'}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <div className="st-actions">
          <Saved show={saved} />
          <button type="submit" className="primary">Save passcode</button>
        </div>
      </form>
      <p className="st-note">Kept on this phone only. Typed once.</p>
    </div>
  )
}

/* ---------- Look ---------- */

function LookPanel({ settings, mode, onMode }: { settings: SettingsT; mode: ThemeMode; onMode: (m: ThemeMode) => void }) {
  const [name, setName] = useState(settings.name ?? 'Mahmoud')
  const [saved, setSaved] = useState(false)
  const opts: { id: ThemeMode; label: string }[] = [{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]
  return (
    <div className="st-look">
      <h3 className="st-h">Appearance</h3>
      <div className="st-themes">
        {opts.map((o, i) => (
          <button key={o.id} className={`st-theme${mode === o.id ? ' on' : ''}`} onClick={() => onMode(o.id)} style={{ animationDelay: `${i * 50}ms` }} aria-pressed={mode === o.id}>
            <span className={`st-mock ${o.id}`} aria-hidden>
              <i /><i /><i />
            </span>
            {o.label}
          </button>
        ))}
      </div>
      <p className="st-note">Auto follows your iPhone. Tapping the logo also switches.</p>

      <h3 className="st-h">Greeting</h3>
      <form className="st-pass" onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await saveSettings({ ...settings, name: name.trim() }); setSaved(true) } }}>
        <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} aria-label="Your name" />
        <button type="submit">{saved ? 'Saved' : 'Save'}</button>
      </form>
    </div>
  )
}

/* ---------- Backup (unchanged behaviour) ---------- */

function BackupPanel() {
  const [msg, setMsg] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)) }, [])

  const doExport = async () => {
    const data = await exportBackup()
    const name = `repfuel-backup-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
    // On iPhone the share sheet lets you save straight to Files or iCloud Drive.
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'RepFuel backup' }); setMsg('Backup exported'); return } catch { /* cancelled */ return }
    }
    const url = URL.createObjectURL(file)
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.click()
    URL.revokeObjectURL(url)
    setMsg('Backup exported')
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      if (!window.confirm(`Replace everything in RepFuel with the backup from ${backup.exportedAt.slice(0, 10)}? This can't be undone.`)) return
      await restoreBackup(backup)
      setMsg(`Backup imported: ${backup.entries.length} logged items, ${backup.foods.length} foods`)
    } catch (err) {
      setMsg((err as Error).message)
    }
  }

  return (
    <div className="st-backup">
      <p className="st-note st-lead">Your data lives only on this phone. Export a backup to Files or iCloud Drive now and then.</p>
      <div className="st-bk">
        <button onClick={doExport}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
          Export
        </button>
        <label className="button">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M12 3v12M7 10l5 5 5-5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
          Import
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      {persisted === false && <p className="st-note">Storage isn&apos;t locked yet. Add RepFuel to your Home Screen so iOS keeps your data.</p>}
    </div>
  )
}
