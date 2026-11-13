import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Exercise } from '../db/types'
import { fmtWeight, stepFor } from '../logic/train'

export type DialMode = 'now' | 'next'

const TICK = 10 // px between ticks

/**
 * Plate dial: a ruler you swipe like a scale. Snaps to 0.5 kg / 1 lb, Level up / Level down jump one plate step.
 * Edits the working weight and the next-goal weight; nothing is saved until Save.
 */
export function WeightDial({ e, start, onClose, onSave }: {
  e: Exercise
  start: DialMode
  onClose: () => void
  onSave: (weight: number, nextWeight: number | undefined) => void
}) {
  const res = e.unit === 'lbs' ? 1 : 0.5 // weight per tick
  const label = e.unit === 'lbs' ? 10 : 5 // number every N
  const max = Math.max(200, Math.ceil(Math.max(e.weight, e.next?.weight ?? 0) * 2 / 10) * 10)
  const count = Math.round(max / res) + 1

  const [mode, setMode] = useState<DialMode>(start)
  const [vals, setVals] = useState({ now: e.weight, next: e.next?.weight ?? e.weight + stepFor(e) })
  const [sawNext, setSawNext] = useState(start === 'next')
  const ref = useRef<HTMLDivElement>(null)
  const value = vals[mode]
  const original = mode === 'now' ? e.weight : (e.next?.weight ?? null)

  // Jump the ruler to the selected weight whenever the tab changes (no animation).
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = (vals[mode] / res) * TICK
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const v = Math.min(max, Math.max(0, Math.round(el.scrollLeft / TICK) * res))
    if (v !== vals[mode]) {
      setVals((s) => ({ ...s, [mode]: v }))
    }
  }

  const jump = (sign: 1 | -1) => {
    const step = stepFor({ weight: value })
    const target = Math.min(max, Math.max(0, Math.round((value + sign * step) / res) * res))
    ref.current?.scrollTo({ left: (target / res) * TICK, behavior: 'smooth' })
  }

  // Ticks never change while the dial is open, so build them once.
  const ticks = useMemo(() => Array.from({ length: count }, (_, i) => {
    const w = i * res
    const major = Math.abs(w % label) < 1e-9
    const mid = !major && Number.isInteger(w) && (e.unit === 'lbs' ? w % 5 === 0 : true)
    return (
      <span key={i} className={`wd-tick${major ? ' major' : mid ? ' mid' : ''}`}>
        {major && <em>{w}</em>}
      </span>
    )
  }), [count, res, label, e.unit])

  const delta = original === null ? null : Math.round((value - original) * 10) / 10
  const nowDelta = vals.now - e.weight
  const saveLabel = nowDelta > 0 ? `Level up to ${fmtWeight(vals.now)} ${e.unit}` : nowDelta < 0 ? `Level down to ${fmtWeight(vals.now)} ${e.unit}` : 'Save'
  const tone = nowDelta > 0 ? ' up' : nowDelta < 0 ? ' down' : ''

  return createPortal(
    <div className="wd-backdrop" onClick={onClose}>
      <div className="wd-sheet" role="dialog" aria-label={`${e.name} weight`} onClick={(ev) => ev.stopPropagation()}>
        <span className="wd-grab" aria-hidden />
        <h2 className="wd-title">{e.name}</h2>

        <div className="unit-seg wd-seg" role="radiogroup" style={{ '--n': 2, '--i': mode === 'now' ? 0 : 1 } as CSSProperties}>
          <span className="unit-thumb" aria-hidden />
          <button role="radio" aria-checked={mode === 'now'} onClick={() => setMode('now')}>Working weight</button>
          <button role="radio" aria-checked={mode === 'next'} onClick={() => { setMode('next'); setSawNext(true) }}>Next goal</button>
        </div>

        <div className="wd-readout">
          <strong className="wd-num">{fmtWeight(value)}</strong>
          <span className="wd-unit">{e.unit}</span>
        </div>
        <div className="wd-delta-row">
          {delta === null ? (
            <span className="wd-delta new">new goal</span>
          ) : delta !== 0 ? (
            <span key={delta > 0 ? 'u' : 'd'} className={`wd-delta ${delta > 0 ? 'up' : 'down'}`}>
              {delta > 0 ? '▲' : '▼'} {fmtWeight(Math.abs(delta))} {e.unit}
            </span>
          ) : (
            <span className="wd-delta same">no change</span>
          )}
        </div>

        <div className="wd-ruler">
          <div className="wd-pointer" aria-hidden />
          <div className="wd-track" ref={ref} onScroll={onScroll} style={{ '--tick': `${TICK}px` } as CSSProperties}>
            <div className="wd-ticks">{ticks}</div>
          </div>
        </div>

        <div className="wd-jumps">
          <button className="wd-jump down" onClick={() => jump(-1)} disabled={value <= 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" /></svg>
            Level down
          </button>
          <button className="wd-jump up" onClick={() => jump(1)} disabled={value >= max}>
            Level up
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
          </button>
        </div>
        {mode === 'next' && vals.next <= vals.now && <p className="wd-note">Goal must be above {fmtWeight(vals.now)} {e.unit}; it will move one step up.</p>}

        <div className="wd-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className={`primary wd-save${tone}`}
            onClick={() => onSave(vals.now, e.next || sawNext ? vals.next : undefined)}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
