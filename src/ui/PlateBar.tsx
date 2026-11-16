import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { WeightUnit } from '../db/types'
import { fmtWeight } from '../logic/train'
import { PLATES, loadPlates, plateTotal } from '../logic/plates'
import { haptic } from './haptic'

/** How each plate looks: thickness and height in px, heaviest first (same order as PLATES). */
const LOOK: Record<WeightUnit, { th: number; h: number }[]> = {
  kg: [{ th: 14, h: 84 }, { th: 11, h: 68 }, { th: 9, h: 54 }, { th: 7, h: 42 }],
  lbs: [{ th: 14, h: 84 }, { th: 12, h: 72 }, { th: 9, h: 56 }, { th: 8, h: 46 }, { th: 6, h: 38 }],
}
const COLLAR = 52 // px from the centre to where plates start
const SLEEVE = 88 // px of sleeve the plates must fit in (scaled down when heavier)
const GAP = 2
const SAVE_AFTER = 450 // ms after the last tap

type Plate = { id: number; v: number; d: number; out?: boolean; x?: number }
type Load = { list: Plate[]; rest: number }

let uid = 0
const HINT = 'rf-plate-hint'

/**
 * The weight as a loaded barbell. Tap a plate below to slide it on; tap the bar to take the nearest plate off.
 * The number counts with every plate; the new weight saves once you stop tapping.
 */
export function PlateBar({ weight, unit, label, onCommit, onOpen }: {
  weight: number
  unit: WeightUnit
  label: string
  onCommit: (weight: number) => void
  /** Tap on the number: the full weight dial for exact values. */
  onOpen: () => void
}) {
  const values = PLATES[unit]
  const looks = LOOK[unit]
  const kind = (v: number) => Math.max(0, values.indexOf(v))
  const build = (w: number, stagger: boolean): Load => {
    const r = loadPlates(w, values)
    return { list: r.plates.map((v, i) => ({ id: ++uid, v, d: stagger ? 120 + i * 45 : 0 })), rest: r.rest }
  }

  const [load, setLoad] = useState<Load>(() => build(weight, true))
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT) } catch { return false } })
  const latest = useRef(load)
  latest.current = load
  const commit = useRef(onCommit)
  commit.current = onCommit
  const pending = useRef<number | undefined>(undefined)

  const sumOf = (l: Load) => plateTotal(l.list.filter((p) => !p.out).map((p) => p.v), l.rest)
  const live = load.list.filter((p) => !p.out)
  const sum = sumOf(load)

  const flush = () => {
    if (pending.current === undefined) return
    window.clearTimeout(pending.current)
    pending.current = undefined
    commit.current(sumOf(latest.current))
  }
  const schedule = () => {
    window.clearTimeout(pending.current)
    pending.current = window.setTimeout(flush, SAVE_AFTER)
  }
  // Leaving the card mid-tap still saves.
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // A change from elsewhere (dial, level up) rebuilds the bar; ignored while our own change waits to save.
  useEffect(() => {
    if (pending.current !== undefined) return
    if (Math.abs(sumOf(latest.current) - weight) < 0.001) return
    setDir(weight > sumOf(latest.current) ? 'up' : 'down')
    setLoad(build(weight, false))
  }, [weight]) // eslint-disable-line react-hooks/exhaustive-deps

  const used = () => {
    if (!hint) return
    setHint(false)
    try { localStorage.setItem(HINT, '1') } catch { /* private mode */ }
  }

  const add = (v: number) => {
    if (sum + v > 999) return
    haptic()
    used()
    setDir('up')
    setLoad((l) => ({
      ...l,
      list: [...l.list, { id: ++uid, v, d: 0 }].sort((a, b) => b.v - a.v || a.id - b.id),
    }))
    schedule()
  }

  // Where each plate on the bar sits (px from the collar outwards), scaled to fit the sleeve.
  const width = live.reduce((t, p) => t + looks[kind(p.v)].th + GAP, 0)
  const s = Math.min(1, SLEEVE / Math.max(1, width))
  const pos = new Map<number, number>()
  let cum = 0
  for (const p of live) { pos.set(p.id, cum); cum += (looks[kind(p.v)].th + GAP) * s }

  const remove = (id: number) => {
    haptic()
    used()
    setDir('down')
    const x = pos.get(id) ?? 0
    setLoad((l) => ({ ...l, list: l.list.map((p) => (p.id === id ? { ...p, out: true, x } : p)) }))
    window.setTimeout(() => setLoad((l) => ({ ...l, list: l.list.filter((p) => p.id !== id) })), 260)
    schedule()
  }

  // Tap on the bar: take off the plate nearest the finger (thin plates don't need a precise tap).
  const tapBar = (ev: MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const d = Math.abs(ev.clientX - (r.left + r.width / 2)) - COLLAR
    if (d < -10 || !live.length) return
    let best: Plate | null = null
    let gap = Infinity
    for (const p of live) {
      const th = looks[kind(p.v)].th * s
      const mid = (pos.get(p.id) ?? 0) + th / 2
      const g = Math.abs(d - mid)
      if (g < gap) { gap = g; best = p }
    }
    if (best && gap < 28) remove(best.id)
  }

  const plates = load.list.map((p) => {
    const k = kind(p.v)
    const { th, h } = looks[k]
    const x = p.out ? (p.x ?? 0) : (pos.get(p.id) ?? 0)
    const w = th * s
    return (['l', 'r'] as const).map((side) => (
      <span
        key={`${p.id}${side}`}
        className="pb-slot"
        style={{ width: w, height: h, transform: `translate3d(${side === 'r' ? COLLAR + x : -(COLLAR + x + w)}px, -50%, 0)` }}
      >
        <i className={`pb-plate k${k} ${side}${p.out ? ' out' : ''}`} style={{ animationDelay: `${p.d}ms` }} />
      </span>
    ))
  })

  return (
    <div className="pb">
      <button type="button" className="pb-num" onClick={onOpen} aria-label={`${label}: ${fmtWeight(sum)} ${unit}. Open the weight dial`}>
        <span key={sum} className={`pb-n ${dir}`}>{fmtWeight(sum)}</span>
        <small>{unit}</small>
      </button>

      <div className="pb-bar" onClick={tapBar} role="img" aria-label={`${live.length} plates on the bar. Tap the bar to take a plate off.`}>
        <span className="pb-rod" />
        <span className="pb-grip" />
        <span className="pb-collar l" style={{ transform: `translate3d(${-COLLAR}px, -50%, 0)` }} />
        <span className="pb-collar r" style={{ transform: `translate3d(${COLLAR - 5}px, -50%, 0)` }} />
        {plates}
        {load.rest > 0 && (
          <span className="pb-rest" style={{ transform: `translate3d(${COLLAR + cum + 6}px, -50%, 0)` }}>+{fmtWeight(load.rest)}</span>
        )}
      </div>

      <div className="pb-tray" role="group" aria-label="Add a plate">
        {values.map((v, k) => (
          <button key={v} type="button" className={`pb-chip k${k}`} style={{ '--k': k } as CSSProperties} onClick={() => add(v)} aria-label={`Add ${fmtWeight(v)} ${unit}`}>
            <b>{fmtWeight(v)}</b>
          </button>
        ))}
      </div>
      {live.length > 0 && (
        <div className="visually-hidden">
          {live.map((p) => (
            <button key={p.id} type="button" onClick={() => remove(p.id)}>Take off {fmtWeight(p.v)} {unit} plate</button>
          ))}
        </div>
      )}
      {hint && <p className="pb-hint">Tap a plate to load it · tap the bar to take one off</p>}
    </div>
  )
}
