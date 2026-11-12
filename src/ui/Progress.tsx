import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animates a number from its previous value to the new one (once per change). */
function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let id = 0
    const step = (t: number) => {
      const k = reduced() ? 1 : Math.min(1, (t - start) / ms)
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3))
      setShown(v)
      from.current = v
      if (k < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [value, ms])
  return shown
}

/** Starts at 0 and animates to `ratio` after mount, so bars and rings fill on open. */
function useFill(ratio: number): number {
  const [r, setR] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setR(ratio))
    return () => cancelAnimationFrame(id)
  }, [ratio])
  return r
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const fmt = (v: number) => Math.round(v).toLocaleString('en-US')

export function KcalRing({ eaten, target }: { eaten: number; target: number }) {
  const left = target - eaten
  const over = left < 0
  const fill = useFill(clamp(target ? eaten / target : 0))
  const shown = useCountUp(Math.abs(left))
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle cx="60" cy="60" r={r} className="ring-fill" style={{ stroke: over ? 'var(--fat)' : 'var(--kcal)', strokeDasharray: c, strokeDashoffset: c * (1 - fill) }} />
      </svg>
      <div className="ring-label">
        <strong className={over ? 'over' : ''}>{fmt(shown)}</strong>
        <span>{over ? 'kcal over' : 'kcal left'}</span>
      </div>
    </div>
  )
}

export function MacroBar({ label, color, eaten, target }: { label: string; color: string; eaten: number; target: number }) {
  const fill = useFill(clamp(target ? eaten / target : 0))
  const left = target - eaten
  return (
    <div className="bar">
      <div className="bar-head">
        <span><i style={{ background: color }} />{label}</span>
        <span className="muted">{fmt(eaten)} / {fmt(target)}g</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ background: color, transform: `scaleX(${fill})` }} /></div>
      <div className={`bar-left ${left < 0 ? 'over' : ''}`}>{left < 0 ? `${fmt(-left)}g over` : `${fmt(left)}g left`}</div>
    </div>
  )
}
