import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { deleteEntry, logFood, logQuick, saveFood } from '../db/repo'
import type { Food, FoodCategory, Macros, Unit } from '../db/types'
import { autoKcal, defaultAmount, kcalLooksWrong, scaleFood } from '../logic/macros'
import { buildItems, cycleUnit, foodsContext, itemInfo, itemMacros, labelGrams, mealTotals, toFood, type AiMeal, type MealItem } from '../logic/meal'
import { formatDay } from '../logic/dates'
import { askPhoto, askSearch, photoToBase64, type AiFood, type PhotoEvent, type PhotoKind } from '../logic/ai'
import { searchByName } from '../logic/search'
import { FoodForm } from './FoodForm'
import { useWeek } from '../ui/hooks'
import { useCountUp } from '../ui/motion'
import { Odometer } from '../ui/Odometer'
import { IconAi } from '../ui/icons'
import { CATEGORIES, fmtAmount } from '../ui/format'
import { availableUnits, convert, fmtQty, gramsFromLabel, quickAmounts, servingNoun, STEP, toBase, toStored, unitName, type AmountUnit, type UnitInfo } from '../logic/units'

interface Props {
  date: string
  today: string
  onClose: () => void
}

const k = (v: number) => Math.round(v).toLocaleString('en-US')

/** What the detail view is showing: a saved food, an AI result, or a blank manual entry. */
interface Draft extends Macros {
  source: 'saved' | 'ai' | 'label' | 'manual'
  food?: Food
  name: string
  baseAmount: number
  unit: Unit
  servingLabel: string
  amount: number
  estimate: boolean
  confidence?: 'high' | 'medium' | 'low'
  note?: string
  gramsPerServing?: number
  liquid?: boolean
  /** Unit the amount box opens in, when it differs from `unit` (e.g. AI eggs: macros per g, shown as pieces). */
  initialUnit?: AmountUnit
  /** Site the AI found the numbers on (web search). */
  web?: string
}

/** A typed AI result: the words you typed, and how many times it was fixed (so the screen refreshes in place). */
interface AiCtx { text: string; rev: number }

/** Live state of a photo being analysed: how many steps are done and what the AI has said so far. */
interface PhotoRun {
  kind: 'photo'
  photo: string
  done: number
  found?: PhotoKind
  seen?: string
  items: { name: string; kcal?: number }[]
  retried?: boolean
}

type View = { kind: 'home' } | { kind: 'describe' } | { kind: 'edit'; food: Food } | { kind: 'busy'; label: string } | PhotoRun | { kind: 'nofood'; photo: string; note: string } | { kind: 'detail'; draft: Draft; ai?: AiCtx } | { kind: 'meal'; name: string; items: MealItem[]; ai?: AiCtx }

export function AddFood({ date, today, onClose }: Props) {
  const foods = useLiveQuery(() => db.foods.where('archived').equals(0).sortBy('name'), []) ?? []
  // Most-logged foods first: they become the 1-tap chips.
  const recentIds = useLiveQuery(async () => {
    const counts = new Map<number, number>()
    for (const e of await db.entries.orderBy('createdAt').reverse().limit(300).toArray()) {
      if (e.foodId) counts.set(e.foodId, (counts.get(e.foodId) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, []) ?? []
  const week = useWeek(date, today)
  const day = week?.days.find((d) => d.date === date)

  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<FoodCategory | 'all' | 'review'>('all')
  const [view, setView] = useState<View>({ kind: 'home' })
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ text: string; ids: number[] } | null>(null)
  // The plate: foods picked to log together, each with its amount. `round` restarts the counters for a fresh plate.
  const [plate, setPlate] = useState<{ id: number; amount: number }[]>([])
  const [round, setRound] = useState(0)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // The photo being analysed: kept while its screens show it, freed when a new one comes or the page closes.
  const photoUrl = useRef('')
  const run = useRef(0)
  useEffect(() => () => { if (photoUrl.current) URL.revokeObjectURL(photoUrl.current) }, [])

  // Each view starts at the top (the edit form otherwise opens where the detail was scrolled to).
  useEffect(() => { window.scrollTo(0, 0) }, [view.kind])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(id)
  }, [toast])

  const byId = new Map(foods.map((f) => [f.id!, f]))
  const recent = recentIds.map((id) => byId.get(id)).filter((f): f is Food => !!f).slice(0, 8)
  const q = query.trim().toLowerCase()
  const review = foods.filter((f) => f.needsReview).length
  // Category chips only filter the browse list; typing searches everything.
  const matches = q ? searchByName(foods, q)
    : foods.filter((f) => cat === 'all' || (cat === 'review' ? f.needsReview : f.category === cat))
  const cats = CATEGORIES.filter((c) => foods.some((f) => f.category === c.value))

  const dayLabel = date === today ? 'Today' : formatDay(date, { weekday: 'short', day: 'numeric', month: 'short' })

  const open = (f: Food) => setView({
    kind: 'detail',
    draft: { source: 'saved', food: f, name: f.name, baseAmount: f.baseAmount, unit: f.unit, servingLabel: f.servingLabel ?? fmtAmount(f.baseAmount, f.unit), amount: defaultAmount(f), estimate: f.estimate, note: f.needsReview ? f.note ?? 'Check these numbers.' : undefined, ...labelGrams(f), kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
  })

  const quickLog = async (f: Food) => {
    const id = await logFood(date, f, defaultAmount(f))
    setToast({ text: `${short(f.name)} added`, ids: [id] })
  }

  const onPlate = new Set(plate.map((p) => p.id))
  // Tap a food's ring: it goes on the plate (a dot flies down to it), tap again to take it off.
  const pick = (f: Food, from: Element) => {
    if (onPlate.has(f.id!)) return setPlate((list) => list.filter((p) => p.id !== f.id))
    setPlate((list) => [...list, { id: f.id!, amount: defaultAmount(f) }])
    flyToPlate(from)
  }
  const plateItems = plate.map((p) => ({ ...p, food: byId.get(p.id) })).filter((p): p is { id: number; amount: number; food: Food } => !!p.food)
  const logPlate = () => db.transaction('rw', db.entries, () => Promise.all(plateItems.map((p) => logFood(date, p.food, p.amount))))
  const plateDone = (ids: number[]) => {
    setToast({ text: `${ids.length} foods added`, ids })
    setPlate([])
    setRound((r) => r + 1)
  }

  const showAiFood = (f: AiFood, source: 'ai' | 'label') => setView({
    kind: 'detail',
    draft: { source, name: f.name, baseAmount: f.baseAmount, unit: f.unit, servingLabel: f.servingLabel, amount: f.defaultAmount, estimate: source === 'ai', confidence: f.confidence, note: f.note, gramsPerServing: f.gramsPerServing, liquid: f.liquid, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
  })

  // Described food or meal: the AI searches the web, then splits it into items. One item opens the normal detail; more open the meal list.
  const runMeal = async (text: string) => {
    setError('')
    setView({ kind: 'busy', label: 'Searching the web…' })
    try {
      showMeal(await askSearch(text, foodsContext(foods)), { text, rev: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setView({ kind: 'home' })
    }
  }

  // "It was 3 eggs, no oil": the AI corrects what the screen shows now, and the same screen updates. Errors show in the fix box.
  const fixMeal = async (ai: AiCtx, correction: string, current: string) => {
    const meal = await askSearch(ai.text, foodsContext(foods), { text: correction, current })
    showMeal(meal, { text: ai.text, rev: ai.rev + 1 })
  }

  const showMeal = (meal: AiMeal, ai?: AiCtx) => {
    const items = buildItems(meal, foods)
    if (items.length === 1) {
      const i = items[0]
      if (i.food) {
        const f = i.food
        setView({ kind: 'detail', ai, draft: { source: 'saved', food: f, name: f.name, baseAmount: f.baseAmount, unit: f.unit, servingLabel: f.servingLabel ?? fmtAmount(f.baseAmount, f.unit), amount: i.amount, initialUnit: i.unit, estimate: f.estimate, ...labelGrams(f), kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat } })
      } else {
        // Countable (egg, banana): numbers per piece so the page says "eggs"; otherwise per the weight eaten.
        const perPiece = i.baseUnit !== 'serving' && i.gramsPerServing
        const base = perPiece ? round1All(scaleFood({ ...i.base, baseAmount: i.baseAmount }, i.gramsPerServing!)) : i.base
        setView({ kind: 'detail', ai, draft: { source: 'ai', name: i.name, baseAmount: perPiece ? 1 : i.baseAmount, unit: perPiece ? 'serving' : i.baseUnit, servingLabel: perPiece || i.baseUnit === 'serving' ? i.servingLabel : `${i.baseAmount} ${i.baseUnit}`, amount: i.amount, initialUnit: i.unit, estimate: i.estimate, web: i.source, confidence: i.confidence, note: i.note, gramsPerServing: i.gramsPerServing, liquid: i.liquid, ...base } })
      }
      return
    }
    setView({ kind: 'meal', name: meal.name, items, ai })
  }

  // Any photo: the AI decides label / food / nothing, and each step it reports updates the screen as it happens.
  const onPhoto = async (file?: File) => {
    if (!file) return
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    const photo = (photoUrl.current = URL.createObjectURL(file))
    const id = ++run.current
    const live = () => run.current === id
    const step = (f: (r: PhotoRun) => PhotoRun) => { if (live()) setView((v) => (v.kind === 'photo' ? f(v) : v)) }
    setError('')
    setView({ kind: 'photo', photo, done: 0, items: [] })
    let img
    try {
      img = await photoToBase64(file)
    } catch {
      if (live()) { setError('Could not open that photo. Try another one.'); setView({ kind: 'home' }) }
      return
    }
    step((r) => ({ ...r, done: 1 }))
    const onEvent = (e: PhotoEvent) => step((r) => {
      if (e.t === 'start') return { ...r, done: Math.max(r.done, 2) }
      if (e.t === 'retry') return { ...r, done: 2, found: undefined, seen: undefined, items: [], retried: true }
      if (e.t === 'kind') return { ...r, done: 3, found: e.kind }
      if (e.t === 'seen') return { ...r, seen: e.text }
      const items = [...r.items]
      items[e.i] = { name: e.name, kcal: e.kcal ?? items[e.i]?.kcal }
      return { ...r, items }
    })
    try {
      const res = await askPhoto(img, foodsContext(foods), onEvent)
      if (!live()) return
      // Let the last tick and chip land before moving on.
      step((r) => ({ ...r, done: 4 }))
      await new Promise((ok) => setTimeout(ok, 450))
      if (!live()) return
      if (res.kind === 'label') showAiFood(res.food, 'label')
      else if (res.kind === 'food') showMeal(res.meal)
      else setView({ kind: 'nofood', photo, note: res.note })
    } catch (e) {
      if (!live()) return
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setView({ kind: 'home' })
    }
  }

  const manual = () => setView({
    kind: 'detail',
    draft: { source: 'manual', name: query.trim(), baseAmount: 1, unit: 'serving', servingLabel: '1 serving', amount: 1, estimate: true, kcal: 0, protein: 0, carbs: 0, fat: 0 },
  })

  // After adding, stay on this page: a check plays, then you're back at the search with an Undo.
  const finish = (id: number, name: string) => {
    setDone(true)
    window.setTimeout(() => {
      setDone(false)
      setQuery('')
      setView({ kind: 'home' })
      setToast({ text: `${short(name)} added`, ids: [id] })
    }, 750)
  }

  const back = () => {
    run.current++ // a photo still being analysed is dropped
    if (view.kind === 'home') onClose()
    else setView({ kind: 'home' })
  }

  return (
    <div className={`addpage${view.kind === 'detail' || view.kind === 'meal' ? ' docked' : ''}${view.kind === 'home' && plateItems.length ? ' plated' : ''}`} role="dialog" aria-label="Add food">
      {/* Copy of the page background over the header (and the Add button when there is one), so content scrolls under cleanly. */}
      <div className="aurora aurora-cover add-cover" aria-hidden="true" />
      <header className="add-top">
        <button className="add-back" onClick={back} aria-label={view.kind === 'home' ? 'Close' : 'Back'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>{view.kind === 'edit' ? 'Edit food' : 'Add food'}</h1>
        <span className="add-day">{dayLabel}</span>
      </header>

      <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = '' }} />

      {view.kind === 'home' && (
        <div className="add-home">
          <div className="add-box">
            <svg className="add-box-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input
              type="search" enterKeyHint="search" placeholder="What did you eat?" value={query}
              autoCorrect="off" autoCapitalize="none" spellCheck={false}
              onChange={(e) => { setQuery(e.target.value); setError('') }}
              aria-label="What did you eat?"
            />
            <button className="add-tool cam" onClick={() => fileRef.current?.click()} aria-label="Photo of food or a nutrition label">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
            </button>
            <button className="add-tool ai" onClick={() => setView({ kind: 'describe' })} aria-label="Describe your meal for AI">
              <IconAi size={23} />
            </button>
            <button className="add-tool pen" onClick={manual} aria-label="Enter numbers yourself">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
            </button>
          </div>

          {error && <p className="warn add-error">{error}</p>}

          {!q && recent.length > 0 && (
            <>
              <h2 className="add-h">Recent <span>{plate.length ? 'tap to put on your plate' : 'tap to add'}</span></h2>
              <div className="add-chips">
                {recent.map((f, i) => (
                  <button
                    key={f.id} className="add-chip" style={{ animationDelay: `${0.04 * i}s`, ...blend(f) }}
                    aria-pressed={plate.length ? onPlate.has(f.id!) : undefined}
                    onClick={(e) => (plate.length ? pick(f, e.currentTarget) : quickLog(f))}
                  >
                    <i aria-hidden="true" />{short(f.name)}
                  </button>
                ))}
              </div>
            </>
          )}

          <h2 className="add-h">{q ? (matches.length ? 'Your foods' : 'No saved match') : <>Your foods <span>{foods.length}</span></>}</h2>
          {!q && (
            <div className="add-chips add-cats">
              <button aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
              {review > 0 && <button className="add-cat-review" aria-pressed={cat === 'review'} onClick={() => setCat('review')}>Check {review}</button>}
              {cats.map((c) => (
                <button key={c.value} aria-pressed={cat === c.value} onClick={() => setCat(c.value)}>{c.label}</button>
              ))}
            </div>
          )}
          <ul className="add-list">
            {matches.map((f, i) => (
              <FoodCard key={f.id} food={f} index={i} dayTarget={day?.target.kcal ?? 2000} picked={onPlate.has(f.id!)} onPick={(el) => pick(f, el)} onOpen={() => open(f)} />
            ))}
            {q && (
              <li style={{ animationDelay: `${0.04 * Math.min(matches.length, 8)}s` }} className={`add-card add-ai${matches.length ? '' : ' solo'}`}>
                <button onClick={() => runMeal(query.trim())}>
                  <span className="add-ai-dot" aria-hidden="true">
                    <IconAi size={20} />
                  </span>
                  <span className="add-card-text">
                    <strong>Estimate “{query.trim()}”</strong>
                    <small>AI searches the web, splits a meal into items</small>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {view.kind === 'describe' && (
        <Describe initial={query.trim()} onEstimate={runMeal} />
      )}

      {view.kind === 'edit' && (
        <FoodForm food={view.food} onDone={() => setView({ kind: 'home' })} />
      )}

      {view.kind === 'busy' && (
        <div className="add-busy">
          <div className="add-progress"><span /></div>
          <p>{view.label}</p>
        </div>
      )}

      {view.kind === 'photo' && <PhotoProgress run={view} />}

      {view.kind === 'nofood' && (
        <div className="add-busy add-nofood">
          <img src={view.photo} alt="" className="add-photo" />
          <h2>No food found</h2>
          <p>{view.note}</p>
          <div className="add-nofood-go">
            <button className="primary" onClick={() => fileRef.current?.click()}>Retake photo</button>
            <button className="link" onClick={() => setView({ kind: 'describe' })}>Type it instead</button>
          </div>
        </div>
      )}

      {view.kind === 'detail' && (
        <Detail
          key={view.draft.name + view.draft.source + (view.ai?.rev ?? '')} draft={view.draft} onFix={view.ai ? (c, cur) => fixMeal(view.ai!, c, cur) : undefined} eaten={day?.eaten.kcal ?? 0} target={day?.target.kcal ?? 0} date={date} onDone={finish}
          toPlate={plate.length && view.draft.food ? (amount, from) => {
            // Building a plate: the chosen amount goes on it (or updates it) instead of logging straight away.
            const id = view.draft.food!.id!
            setPlate((list) => (list.some((p) => p.id === id) ? list.map((p) => (p.id === id ? { ...p, amount } : p)) : [...list, { id, amount }]))
            setView({ kind: 'home' })
            flyToPlate(from)
          } : undefined} onEdit={view.draft.food ? () => setView({ kind: 'edit', food: view.draft.food! }) : undefined} />
      )}

      {view.kind === 'meal' && (
        <Meal key={view.ai?.rev ?? 0} name={view.name} initial={view.items} onFix={view.ai ? (c, cur) => fixMeal(view.ai!, c, cur) : undefined} eaten={day?.eaten.kcal ?? 0} target={day?.target.kcal ?? 0} date={date} onDone={finish} />
      )}

      {view.kind === 'home' && plateItems.length > 0 && (
        <Plate
          key={round} round={round} items={plateItems} eaten={day?.eaten.kcal ?? 0} target={day?.target.kcal ?? 0}
          onAmount={(id, amount) => setPlate((list) => list.map((p) => (p.id === id ? { ...p, amount } : p)))}
          onRemove={(id) => setPlate((list) => list.filter((p) => p.id !== id))}
          onClear={() => { setPlate([]); setRound((r) => r + 1) }}
          onLog={logPlate} onDone={plateDone}
        />
      )}

      {toast && (
        <div key={toast.ids.join()} className="add-toast" role="status">
          <span>{toast.text}{day && <small>{k(Math.abs(day.target.kcal - day.eaten.kcal))} kcal {day.eaten.kcal > day.target.kcal ? 'over' : 'left'}</small>}</span>
          <button onClick={() => { toast.ids.forEach((id) => deleteEntry(id)); setToast(null) }}>Undo</button>
        </div>
      )}

      {done && (
        <div className="add-done" aria-live="polite">
          <span><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <p>Added</p>
        </div>
      )}
    </div>
  )
}

/** The photo being analysed, with real steps ticking off as the AI reports them and the items it finds popping in. */
function PhotoProgress({ run }: { run: PhotoRun }) {
  const { done, found, seen, items } = run
  const look = found === 'label' ? 'Nutrition label found' : found === 'none' ? 'No food spotted' : seen ? `Spotted: ${seen}` : 'Food found'
  const steps: [string, string][] = [
    ['Preparing photo', 'Photo ready'],
    ['Sending to AI', 'Sent to AI'],
    ['Looking at the photo', look],
    found === 'label' ? ['Reading the numbers', 'Numbers read'] : found === 'none' ? ['Double-checking', 'Checked'] : ['Working out portions and macros', 'Macros worked out'],
  ]
  return (
    <div className="add-busy add-scan" aria-live="polite">
      <div className={`add-shot${done >= 4 ? ' done' : ''}`}>
        <img src={run.photo} alt="" className="add-photo" />
        <span className="add-sweep" aria-hidden="true" />
      </div>
      <ol className="add-steps">
        {steps.map(([doing, did], i) => {
          const state = i < done ? 'did' : i === done ? 'doing' : 'todo'
          return (
            <li key={i} className={state}>
              <span className="add-step-dot" aria-hidden="true">
                {state === 'did' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              </span>
              <span key={state === 'did' ? did : doing} className="add-step-text">{state === 'did' ? did : doing}</span>
            </li>
          )
        })}
      </ol>
      {run.retried && done < 3 && <p className="add-retry">First AI was busy, asking another</p>}
      {items.length > 0 && (
        <ul className="add-found">
          {items.map((it, i) => it && (
            <li key={i}>{it.name}{it.kcal !== undefined && <b>{k(it.kcal)} kcal</b>}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Shortens long names for the chips ("McDonald's medium vanilla milkshake" -> "McDonald's medium…"). */
const short = (name: string) => (name.length > 22 ? name.slice(0, 20).trimEnd() + '…' : name)

/** CSS vars for the P/C/F colour blend (same recipe as the Today fuel bars and Week ribbons). */
function blend(m: Macros): CSSProperties {
  const kp = m.protein * 4, kc = m.carbs * 4, kf = m.fat * 9
  const tot = kp + kc + kf || 1
  const pa = (kp / tot) * 100, pc = (kc / tot) * 100
  return { '--s1': `${pa / 2}%`, '--s2': `${pa + pc / 2}%`, '--s3': `${pa + pc + (100 - pa - pc) / 2}%` } as CSSProperties
}

function FoodCard({ food: f, index, dayTarget, picked, onPick, onOpen }: { food: Food; index: number; dayTarget: number; picked: boolean; onPick: (el: Element) => void; onOpen: () => void }) {
  const portion = scaleFood(f, defaultAmount(f))
  const share = Math.min(1, dayTarget ? portion.kcal / dayTarget : 0)
  const r = 15, c = 2 * Math.PI * r
  return (
    <li className={`add-card${picked ? ' picked' : ''}`} style={{ animationDelay: `${0.03 * Math.min(index, 10)}s` }}>
      {/* The ring is the plate toggle: it closes into a full circle and fills with a tick. */}
      <button className="add-pick" onClick={(e) => onPick(e.currentTarget)} aria-pressed={picked} aria-label={picked ? `Take ${f.name} off the plate` : `Put ${f.name} on the plate`}>
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
          <g className="add-mini">
            <circle cx="19" cy="19" r={r} className="wk-ring-track" />
            <circle cx="19" cy="19" r={r} className="wk-ring-arc" strokeDasharray={`${picked ? c : Math.max(share, 0.004) * c} ${c}`} />
          </g>
          <circle cx="19" cy="19" r="13" className="add-pick-fill" />
          <path d="M13 19.5l4 4 8-8.5" className="add-pick-tick" />
        </svg>
      </button>
      <button onClick={onOpen}>
        <span className="add-card-text">
          <strong>{f.name}{f.estimate && <span className="tag">est</span>}{f.needsReview && <span className="tag warn">check</span>}</strong>
          <small>{f.servingLabel ?? fmtAmount(f.baseAmount, f.unit)}</small>
          <span className="add-ribbon" style={blend(f)} aria-hidden="true" />
        </span>
        <span className="add-kcal">{k(portion.kcal)}<small>kcal</small></span>
      </button>
    </li>
  )
}

/** A small dot that arcs from the tapped ring down into the plate, which gives a little bump when it lands. */
function flyToPlate(from: Element) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const a = from.getBoundingClientRect()
  // Two frames: the plate may be mounting this very moment.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = document.querySelector('.plate-target')
    if (!target) return
    const b = target.getBoundingClientRect()
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2
    const dx = b.left + 28 - x0, dy = b.top + b.height / 2 - y0
    const outer = document.createElement('div')
    outer.className = 'plate-fly'
    outer.style.left = `${x0 - 9}px`
    outer.style.top = `${y0 - 9}px`
    const dot = document.createElement('span')
    outer.appendChild(dot)
    document.body.appendChild(outer)
    // X glides, Y lifts first then drops: together they draw an arc.
    outer.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { duration: 560, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'forwards' })
    const fall = dot.animate(
      [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${dy}px) scale(0.45)` }],
      { duration: 560, easing: 'cubic-bezier(0.4, -0.35, 0.75, 1)', fill: 'forwards' },
    )
    fall.onfinish = () => {
      outer.remove()
      target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' })
    }
  }))
}

type PlateItem = { id: number; amount: number; food: Food }

/** The plate: floats at the bottom while foods are picked. Shows the total, what it does to today, and adds them all at once. */
function Plate({ items, round, eaten, target, onAmount, onRemove, onClear, onLog, onDone }: {
  items: PlateItem[]; round: number; eaten: number; target: number
  onAmount: (id: number, amount: number) => void; onRemove: (id: number) => void; onClear: () => void
  onLog: () => Promise<number[]>; onDone: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'adding' | 'added' | 'leaving'>('idle')
  // Today's total at the moment Add is tapped: once saved, the live total already includes the plate.
  const [frozen, setFrozen] = useState<number | null>(null)
  const now = frozen ?? eaten
  const total = items.reduce((t, p) => t + scaleFood(p.food, p.amount).kcal, 0)
  const before = target ? Math.min(1, now / target) : 0
  const after = target ? Math.min(1, (now + total) / target) : 0
  const left = target - now - total
  const n = items.length

  const add = async () => {
    if (phase !== 'idle') return
    setFrozen(eaten)
    setPhase('adding')
    setOpen(false)
    const ids = await onLog()
    setPhase('added')
    window.setTimeout(() => setPhase('leaving'), 650)
    window.setTimeout(() => onDone(ids), 950)
  }

  return createPortal(
    <div className={`add-dock plate-dock ${phase}`}>
      <div className="plate">
        <div className={`plate-list${open ? ' open' : ''}`} aria-hidden={!open}>
          <div>
            <ul>
              {items.map((p, i) => {
                const unit = p.food.unit as AmountUnit
                const step = STEP[unit] ?? 1
                const m = scaleFood(p.food, p.amount)
                const kc = m.kcal
                // Calorie share per macro sizes the ribbon segments.
                const share = [m.protein * 4, m.carbs * 4, m.fat * 9]
                return (
                  <li key={p.id} style={{ animationDelay: `${0.03 * i}s` }}>
                    <span className="plate-name"><strong>{p.food.name}</strong><small>{fmtAmount(p.amount, p.food.unit)} · {k(kc)} kcal</small></span>
                    <span className="plate-step">
                      <button type="button" disabled={p.amount <= step} onClick={() => onAmount(p.id, Math.round((p.amount - step) * 100) / 100)} aria-label={`Less ${p.food.name}`}>−</button>
                      <button type="button" onClick={() => onAmount(p.id, Math.round((p.amount + step) * 100) / 100)} aria-label={`More ${p.food.name}`}>+</button>
                    </span>
                    <button type="button" className="plate-x" onClick={() => onRemove(p.id)} aria-label={`Take ${p.food.name} off the plate`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                    <span className="plate-macros" aria-label={`${k(m.protein)} g protein, ${k(m.carbs)} g carbs, ${k(m.fat)} g fat`}>
                      <span className="plate-ribbon" aria-hidden="true">
                        {MAC.map((x, n) => <i key={x.key} style={{ flexGrow: share[n] || 0.0001, background: x.color }} />)}
                      </span>
                      {MAC.map((x) => (
                        <span key={x.key} className="plate-m" style={{ '--c': x.color } as CSSProperties} aria-hidden="true">
                          <b><Odometer value={m[x.key]} memo={`pl-${p.id}-${x.key}`} delay={0} />g</b>{x.label.toLowerCase()}
                        </span>
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>
            <button type="button" className="link plate-clear" onClick={onClear}>Clear plate</button>
          </div>
        </div>

        <div className="plate-bar">
          <button type="button" className="plate-sum plate-target" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${n} on your plate, ${k(total)} kcal. ${open ? 'Hide' : 'Show'} list`}>
            <span className="plate-count" aria-hidden="true"><Odometer value={n} memo={`plate-${round}-n`} delay={0.42} /></span>
            <span className="plate-text" aria-hidden="true">
              <b><Odometer value={total} memo={`plate-${round}-k`} delay={0.42} /> kcal</b>
              <small>{target > 0 ? (left >= 0 ? `${k(left)} left after` : `${k(-left)} over after`) : `${n} on your plate`}</small>
            </span>
            <svg className="plate-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          </button>
          <button type="button" className="primary plate-go" onClick={add} disabled={phase === 'adding'}>
            {phase === 'added' || phase === 'leaving'
              ? <span key="ok" className="plate-ok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Added</span>
              : <span key="add">Add {n}</span>}
          </button>
        </div>
        {/* Today's fuel: grey = already eaten, green = this plate on top. */}
        <div className={`plate-fuel${now + total > target && target > 0 ? ' over' : ''}`} aria-hidden="true">
          <span className="plate-fuel-now" style={{ width: `${before * 100}%` }} />
          <span className="plate-fuel-add" style={{ left: `${before * 100}%`, width: `${Math.max(0, after - before) * 100}%` }} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

const MAC = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
] as const

type OnFix = (correction: string, current: string) => Promise<void>

function Detail({ draft, eaten, target, date, onDone, onEdit, toPlate, onFix }: { draft: Draft; eaten: number; target: number; date: string; onDone: (id: number, name: string) => void; onEdit?: () => void; toPlate?: (amount: number, from: Element) => void; onFix?: OnFix }) {
  const editable = draft.source !== 'saved'
  const [name, setName] = useState(draft.name)
  const [vals, setVals] = useState({ kcal: num(draft.kcal), protein: num(draft.protein), carbs: num(draft.carbs), fat: num(draft.fat) })
  // Manual entries pick what their numbers are per (1 serving / 100 g / 100 ml) and, optionally, a serving's weight.
  const manual = draft.source === 'manual'
  const [basis, setBasis] = useState<Basis>('serving')
  const [weight, setWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState<'g' | 'ml'>('g')
  const wUnit = basis === 'serving' ? weightUnit : basis
  const eff = manual
    ? {
        unit: basis as Unit, baseAmount: basis === 'serving' ? 1 : 100,
        servingLabel: basis === 'serving' ? '1 serving' : `100 ${basis}`,
        gramsPerServing: Number(weight) > 0 ? Number(weight) : undefined, liquid: wUnit === 'ml',
      }
    : { unit: draft.unit, baseAmount: draft.baseAmount, servingLabel: draft.servingLabel, gramsPerServing: draft.gramsPerServing, liquid: !!draft.liquid }
  const info: UnitInfo = { base: eff.unit, gramsPerServing: eff.gramsPerServing, liquid: eff.liquid }
  const units = availableUnits(info)
  const noun = servingNoun(eff.servingLabel)
  const [unit, setUnit] = useState<AmountUnit>(draft.initialUnit ?? draft.unit)
  const [amount, setAmount] = useState(String(draft.amount))
  // Changing the basis or weight can remove the unit in use; fall back to the first one that still works.
  const setManual = (b: Basis, w: string, wu: 'g' | 'ml') => {
    setBasis(b); setWeight(w); setWeightUnit(wu); setError('')
    const next = availableUnits({ base: b, gramsPerServing: Number(w) > 0 ? Number(w) : undefined, liquid: (b === 'serving' ? wu : b) === 'ml' })
    if (!next.includes(unit)) { setUnit(next[0]); setAmount(String(next[0] === 'serving' ? 1 : 100)) }
  }
  const [editing, setEditing] = useState(draft.source === 'manual')
  const [save, setSave] = useState(draft.source !== 'manual')
  const [error, setError] = useState('')

  const base: Macros = { kcal: Number(vals.kcal || 0), protein: Number(vals.protein || 0), carbs: Number(vals.carbs || 0), fat: Number(vals.fat || 0) }
  const amt = Number(amount)
  const baseAmt = toBase(amt, unit, info)
  const portion = scaleFood({ ...base, baseAmount: eff.baseAmount }, baseAmt)
  const step = STEP[unit]
  const bump = (d: number) => setAmount(String(Math.max(0, Math.round((amt + d) * 100) / 100)))
  const switchUnit = (u: AmountUnit) => {
    if (u === unit) return
    if (amt > 0) setAmount(String(convert(amt, unit, u, info)))
    setUnit(u)
    setError('')
  }
  // "≈ 170 g" / "≈ 1½ cups": the same amount in the other unit, so switching never feels like guessing.
  const other = units.find((u) => u !== unit && (unit === 'serving' ? true : u === 'serving'))
  const equiv = other && amt > 0 ? convert(amt, unit, other, info) : 0

  const submit = async () => {
    if (!name.trim()) return setError('Give it a name.')
    if ([base.kcal, base.protein, base.carbs, base.fat].some((v) => !(v >= 0))) return setError('Numbers must be 0 or more.')
    if (!(base.kcal > 0) && !(base.protein + base.carbs + base.fat > 0)) return setError('Enter the calories.')
    if (!(amt > 0)) return setError('Pick an amount above 0.')
    if (toPlate) {
      const btn = document.querySelector('.add-dock .add-go')
      return toPlate(baseAmt, btn ?? document.body)
    }
    let foodId = draft.food?.id
    if (draft.source !== 'saved') {
      // Keep the serving weight in the label, so this food can switch units next time too.
      const gps = eff.gramsPerServing
      const label = gps && !gramsFromLabel(eff.servingLabel)
        ? eff.unit === 'serving' ? `${eff.servingLabel} (${Math.round(gps)}${eff.liquid ? 'ml' : 'g'})` : `1 serving, ${Math.round(gps)}${eff.liquid ? 'ml' : 'g'}`
        : eff.servingLabel
      if (save) foodId = await saveFood({
        name: name.trim(),
        category: draft.source === 'label' ? 'branded' : 'custom',
        baseAmount: eff.baseAmount, unit: eff.unit, servingLabel: label,
        estimate: draft.estimate, note: draft.note || undefined, ...base,
      })
    }
    // Logged in the unit you picked (litres saved as ml), with macros already scaled.
    const id = await logQuick(date, { name: name.trim(), foodId, estimate: draft.estimate, ...toStored(amt, unit), ...portion })
    onDone(id, name.trim())
  }

  return (
    <form id="add-form" className="add-detail" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <div className="add-hero">
        <PortionRing kcal={portion.kcal} eaten={eaten} target={target} />

        {editable ? (
          <input className="add-name" value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="Name, e.g. Chicken wrap" aria-label="Food name" />
        ) : (
          <h2 className="add-name">{name}</h2>
        )}
        <p className="add-per">
          {draft.confidence && <span className={`tag${draft.confidence === 'low' ? ' warn' : ''}`}>{draft.confidence} confidence</span>}
          {draft.estimate && <span className="tag">estimate</span>}
          {draft.source === 'label' && <span className="tag">from label</span>}
          {draft.web && <span className="tag mine">from {draft.web}</span>}
        </p>
        {draft.note && <p className="muted add-note">{draft.note}</p>}
      </div>

      <div className="add-macros">
        {MAC.map((m, i) => (
          <MacroLine key={m.key} index={i} label={m.label} color={m.color} grams={portion[m.key]} total={portion.protein + portion.carbs + portion.fat} />
        ))}
      </div>

      <div className="card add-amount">
        <div className="add-amount-head">
          <span>How much?</span>
          
        </div>
        {units.length > 1 && (
          <div className="unit-seg" role="radiogroup" aria-label="Unit" style={{ '--n': units.length, '--i': units.indexOf(unit) } as CSSProperties}>
            <span className="unit-thumb" aria-hidden="true" />
            {units.map((u) => (
              <button type="button" role="radio" key={u} aria-checked={u === unit} onClick={() => switchUnit(u)}>{unitName(u, noun, true)}</button>
            ))}
          </div>
        )}
        <div className="add-stepper">
          <button type="button" onClick={() => bump(-step)} aria-label="Less" disabled={amt <= step}>−</button>
          <div className="add-qty" key={unit}>
            <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} aria-label={`Amount in ${unitName(unit, noun)}`} />
            <span>{unitName(unit, noun, false, amt)}</span>
          </div>
          <button type="button" onClick={() => bump(step)} aria-label="More">+</button>
        </div>
        <p className="add-equiv" aria-live="polite">{other && equiv > 0 ? `≈ ${fmtQty(equiv, other)}${other === 'serving' ? ' ' + unitName('serving', noun, false, equiv) : ''}` : '\u00a0'}</p>
        <div className="add-qchips" key={unit}>
          {quickAmounts(unit, info).map((v, i) => (
            <button type="button" key={v} style={{ animationDelay: `${0.03 * i}s` }} aria-pressed={amt === v} onClick={() => { setAmount(String(v)); setError('') }}>{fmtQty(v, unit)}</button>
          ))}
        </div>
      </div>

      {editable && (
        <div className="card add-edit">
          <button type="button" className="add-edit-toggle" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            <span>Numbers per {eff.servingLabel}</span>
            <span className="muted">{editing ? 'Done' : 'Edit'}</span>
          </button>
          {editing && manual && (
            <>
              <div className="unit-seg" role="radiogroup" aria-label="Numbers are per" style={{ '--n': 3, '--i': BASES.indexOf(basis) } as CSSProperties}>
                <span className="unit-thumb" aria-hidden="true" />
                {BASES.map((b) => (
                  <button type="button" role="radio" key={b} aria-checked={b === basis} onClick={() => setManual(b, weight, weightUnit)}>{b === 'serving' ? '1 serving' : `100 ${b}`}</button>
                ))}
              </div>
              <label className="add-weight">
                <span>{basis === 'serving' ? '1 serving weighs' : '1 serving is'} <em>optional</em></span>
                <input type="number" inputMode="decimal" step="any" min="0" value={weight} placeholder="–" onChange={(e) => setManual(basis, e.target.value, weightUnit)} aria-label={`Serving weight in ${wUnit}`} />
                {basis === 'serving' ? (
                  <span className="add-weight-units">
                    {(['g', 'ml'] as const).map((u) => (
                      <button type="button" key={u} aria-pressed={weightUnit === u} onClick={() => setManual(basis, weight, u)}>{u}</button>
                    ))}
                  </span>
                ) : <b>{basis}</b>}
              </label>
            </>
          )}
          {editing && (
            <div className="grid4 add-edit-grid">
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((key) => (
                <label key={key}>{key === 'kcal' ? 'kcal' : key[0].toUpperCase() + key.slice(1)}
                  <input type="number" inputMode="decimal" step="any" min="0" value={vals[key]} placeholder="0" onChange={(e) => { setVals(key === 'kcal' ? { ...vals, kcal: e.target.value } : { ...vals, [key]: e.target.value, kcal: autoKcal({ ...vals, [key]: e.target.value }) }); setError('') }} />
                </label>
              ))}
            </div>
          )}
          {kcalLooksWrong(base) && <p className="warn">Calories don't match the macros. Double-check.</p>}
          <label className="check"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />Save to my foods</label>
        </div>
      )}

      {onEdit && (
        <button type="button" className="card add-edit-saved" onClick={onEdit}>
          <span>Edit or delete this food</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}

      {onFix && <FixBox onFix={(c) => onFix(c, `${name.trim() || draft.name}${draft.source === 'saved' ? ' (saved food)' : ''}${draft.web ? ` (from ${draft.web})` : ''}: ${fmtQty(amt, unit)} ${unitName(unit, noun, false, amt)} = ${macroText(portion)}`)} />}

      {error && <p className="warn add-error">{error}</p>}
      <Dock><button type="submit" form="add-form" className="primary add-go">{toPlate ? 'Put on plate' : 'Add'} {amt > 0 ? `${k(portion.kcal)} kcal` : ''}</button></Dock>
    </form>
  )
}

/** Ring: grey = already eaten today, green = this portion on top. */
function PortionRing({ kcal, eaten, target }: { kcal: number; eaten: number; target: number }) {
  const before = target ? Math.min(1, eaten / target) : 0
  const after = target ? Math.min(1, (eaten + kcal) / target) : 0
  const over = target > 0 && eaten + kcal > target
  const shownKcal = useCountUp(kcal, 700, 150)
  const drawn = useCountUp(after, 900, 200)
  const S = 176, W = 14, r = (S - W) / 2, c = 2 * Math.PI * r
  return (
    <div className="add-ring" style={{ width: S, height: S }}>
      <svg className="kring" width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
        <circle cx={S / 2} cy={S / 2} r={r} strokeWidth={W} className="kring-track" />
        {drawn > before + 0.003 && (
          <circle cx={S / 2} cy={S / 2} r={r} strokeWidth={W} className={`kring-arc${over ? ' over' : ''}`} strokeDasharray={`${drawn * c} ${c}`} />
        )}
        {before > 0.003 && <circle cx={S / 2} cy={S / 2} r={r} strokeWidth={W} className="add-ring-eaten" strokeDasharray={`${before * c} ${c}`} />}
      </svg>
      <div className="add-ring-center">
        <strong className={over ? 'over' : ''}>{k(shownKcal)}</strong>
        <span>kcal</span>
        {target > 0 && <small>{over ? `${k(eaten + kcal - target)} over` : `${k(target - eaten - kcal)} left after`}</small>}
      </div>
    </div>
  )
}

/** A described meal split into items: tick, adjust amounts, save new ones, log it all as one entry. */
function Meal({ name: initialName, initial, eaten, target, date, onDone, onFix }: { name: string; initial: MealItem[]; eaten: number; target: number; date: string; onDone: (id: number, name: string) => void; onFix?: OnFix }) {
  const [name, setName] = useState(initialName)
  const [items, setItems] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const totals = mealTotals(items)
  const on = items.filter((i) => i.on)
  const set = (key: string, patch: Partial<MealItem>) => { setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i))); setError('') }

  const submit = async () => {
    if (!name.trim()) return setError('Give the meal a name.')
    if (!on.length) return setError('Tick at least one item.')
    if (on.some((i) => !(i.amount > 0))) return setError('Every ticked item needs an amount above 0.')
    if (on.some((i) => i.save && !i.name.trim())) return setError('Name the items you want to save.')
    setBusy(true)
    for (const i of on) if (i.save && !i.food) await saveFood(toFood(i))
    const r1 = (n: number) => Math.round(n * 10) / 10
    const id = await logQuick(date, {
      name: name.trim(), amount: 1, unit: 'serving', estimate: on.some((i) => i.estimate),
      kcal: Math.round(totals.kcal), protein: r1(totals.protein), carbs: r1(totals.carbs), fat: r1(totals.fat),
    })
    onDone(id, name.trim())
  }

  return (
    <form id="add-form" className="add-detail" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <div className="add-hero">
        <PortionRing kcal={totals.kcal} eaten={eaten} target={target} />
        <input className="add-name" value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="Meal name" aria-label="Meal name" />
        <p className="add-per"><span className="tag">{on.length} of {items.length} items</span><span className="tag">logs as one meal</span></p>
      </div>

      <div className="add-macros">
        {MAC.map((m, i) => (
          <MacroLine key={m.key} index={i} label={m.label} color={m.color} grams={totals[m.key]} total={totals.protein + totals.carbs + totals.fat} />
        ))}
      </div>

      <h2 className="add-h">Items <span>tick what you ate, fix amounts</span></h2>
      <ul className="meal-list">
        {items.map((i, n) => <MealRow key={i.key} item={i} index={n} onChange={(p) => set(i.key, p)} />)}
      </ul>

      {onFix && <FixBox onFix={(c) => onFix(c, on.map((i) => `${i.name}${i.food ? ' (saved food)' : ''}${i.source ? ` (from ${i.source})` : ''}: ${fmtQty(i.amount, i.unit)} ${unitName(i.unit, servingNoun(i.servingLabel), false, i.amount)} = ${macroText(itemMacros(i))}`).join('\n'))} />}

      {error && <p className="warn add-error">{error}</p>}
      <Dock><button type="submit" form="add-form" className="primary add-go" disabled={busy}>Add meal {on.length ? `${k(totals.kcal)} kcal` : ''}</button></Dock>
    </form>
  )
}

function MealRow({ item: i, index, onChange }: { item: MealItem; index: number; onChange: (p: Partial<MealItem>) => void }) {
  const m = itemMacros(i)
  const noun = servingNoun(i.servingLabel)
  const units = availableUnits(itemInfo(i)).filter((u): boolean => u !== 'l')
  const step = STEP[i.unit]
  const bump = (d: number) => onChange({ amount: Math.max(0, Math.round((i.amount + d) * 100) / 100) })
  const other = units.find((u) => u !== i.unit)
  const equiv = other && i.amount > 0 ? convert(i.amount, i.unit, other, itemInfo(i)) : 0
  return (
    <li className={`meal-row${i.on ? '' : ' off'}`} style={{ animationDelay: `${0.05 * index}s` }}>
      <div className="meal-top">
        <button type="button" className="meal-tick" role="checkbox" aria-checked={i.on} aria-label={`Include ${i.name}`} onClick={() => onChange({ on: !i.on })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
        <span className="meal-text">
          {i.food ? <strong>{i.name}</strong> : <input value={i.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Item name" />}
          <small>
            {i.food ? <span className="tag mine">your food</span> : i.source ? <span className="tag mine">{i.source}</span> : <span className={`tag${i.confidence === 'low' ? ' warn' : ''}`}>{i.confidence}</span>}
            {i.note || i.servingLabel}
          </small>
          <span className="add-ribbon" style={blend(m)} aria-hidden="true" />
        </span>
        <span className="add-kcal">{k(m.kcal)}<small>kcal</small></span>
      </div>
      {i.on && (
        <div className="meal-amount">
          <button type="button" onClick={() => bump(-step)} aria-label="Less" disabled={i.amount <= step}>−</button>
          <label className="meal-qty">
            <input type="number" inputMode="decimal" step="any" min="0" value={i.amount || ''} onChange={(e) => onChange({ amount: Number(e.target.value) })} aria-label={`Amount of ${i.name} in ${unitName(i.unit, noun)}`} />
            {units.length > 1
              ? <button type="button" className="meal-unit" onClick={() => onChange(cycleUnit(i))} aria-label={`Unit: ${unitName(i.unit, noun)}. Tap to switch`}>{unitName(i.unit, noun, false, i.amount)}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg></button>
              : <span className="meal-unit">{unitName(i.unit, noun, false, i.amount)}</span>}
          </label>
          <button type="button" onClick={() => bump(step)} aria-label="More">+</button>
          <span className="meal-equiv">{other && equiv > 0 ? `≈ ${fmtQty(equiv, other)}${other === 'serving' ? ' ' + unitName('serving', noun, false, equiv) : ''}` : ''}</span>
          {!i.food && (
            <button type="button" className="meal-save" aria-pressed={i.save} onClick={() => onChange({ save: !i.save })}>{i.save ? 'Will save' : 'Save'}</button>
          )}
        </div>
      )}
    </li>
  )
}

const num = (v: number) => (v ? String(v) : '')
const round1All = (m: Macros): Macros => ({ kcal: Math.round(m.kcal * 10) / 10, protein: Math.round(m.protein * 10) / 10, carbs: Math.round(m.carbs * 10) / 10, fat: Math.round(m.fat * 10) / 10 })
type Basis = 'serving' | 'g' | 'ml'
const BASES: Basis[] = ['serving', 'g', 'ml']

function MacroLine({ index, label, color, grams, total }: { index: number; label: string; color: string; grams: number; total: number }) {
  const w = useCountUp(total ? grams / total : 0, 800, 250 + index * 90)
  const g = useCountUp(grams, 700, 250 + index * 90)
  return (
    <div className="add-mline">
      <span className="add-mline-label"><i style={{ background: color }} />{label}</span>
      <span className="add-mline-track"><span style={{ width: `${w * 100}%`, background: color }} /></span>
      <b>{Math.round(g * 10) / 10}g</b>
    </div>
  )
}

const EXAMPLES = ['2 fried eggs, baladi bread and tea with milk', 'Medium koshary from Abou Tarek', '2 slices homemade feteer with honey', 'Chicken shawarma sandwich, Syrian style', 'Plate of molokhia with rice and chicken']

/** AI mode: describe a meal in your own words, then Estimate. */
function Describe({ initial, onEstimate }: { initial: string; onEstimate: (text: string) => void }) {
  const [text, setText] = useState(initial)
  const go = () => { if (text.trim()) onEstimate(text.trim()) }
  return (
    <form className="add-describe" onSubmit={(e) => { e.preventDefault(); go() }}>
      <div className="add-describe-head">
        <span className="add-ai-dot big" aria-hidden="true">
          <IconAi size={30} />
        </span>
        <h2>Describe your meal</h2>
        <p className="muted">Say what and how much. AI looks it up online and splits a meal into items.</p>
      </div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Medium koshary from Abou Tarek" aria-label="Describe your meal" />
      <div className="add-examples">
        {EXAMPLES.map((ex, i) => (
          <button type="button" key={ex} style={{ animationDelay: `${0.05 * i}s` }} onClick={() => setText(ex)}>{ex}</button>
        ))}
      </div>
      <button type="submit" className="primary add-go" disabled={!text.trim()}>Estimate</button>
    </form>
  )
}

const macroText = (m: Macros) => `${Math.round(m.kcal)} kcal, P ${Math.round(m.protein)} g, C ${Math.round(m.carbs)} g, F ${Math.round(m.fat)} g`

/** "Not quite right?": type a correction and the AI updates this same screen (no starting over). */
function FixBox({ onFix }: { onFix: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError('')
    // On success the screen re-opens with the fixed numbers, so this box starts fresh.
    try { await onFix(t) } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); setBusy(false) }
  }
  return (
    <div className={`card add-fix${busy ? ' busy' : ''}`}>
      <label className="add-fix-label" htmlFor="add-fix">Not quite right? Tell the AI</label>
      <div className="add-fix-row">
        <input
          id="add-fix" value={text} disabled={busy} enterKeyHint="send" autoComplete="off" placeholder="e.g. it was 3 eggs, no oil"
          onChange={(e) => { setText(e.target.value); setError('') }}
          // Enter fixes; it must not submit the Add form around this box.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }}
        />
        <button type="button" className="add-fix-go" disabled={!text.trim() || busy} onClick={go}>{busy ? 'Fixing…' : 'Fix'}</button>
      </div>
      {busy && <div className="add-progress"><span /></div>}
      {error && <p className="warn">{error}</p>}
    </div>
  )
}

/** The page's main button, pinned to the bottom of the screen so it's always in reach. */
function Dock({ children }: { children: ReactNode }) {
  return createPortal(<div className="add-dock">{children}</div>, document.body)
}
