import { useEffect, useRef, useState } from 'react'
import { haptic } from './haptic'

/**
 * A number with − and + always beside it. Tap steps once; hold repeats, speeding up.
 * The change saves when the finger lifts. Tapping the number itself can open a fuller editor.
 */
export function Stepper({ value, step, min, max, label, show, unit, size = 'mid', className, onCommit, onOpen }: {
  value: number
  step: number
  min: number
  max: number
  label: string
  show?: (n: number) => string
  /** Small label after the number (kg, sets, reps). */
  unit?: string
  size?: 'mid' | 'small'
  className?: string
  onCommit: (n: number) => void
  /** Tap on the number (e.g. the weight dial). */
  onOpen?: () => void
}) {
  const [live, setLive] = useState<number | null>(null)
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const liveRef = useRef<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const prev = useRef(value)

  // Roll direction follows the change, wherever it came from.
  if (value !== prev.current && live === null) {
    setDir(value > prev.current ? 'up' : 'down')
    prev.current = value
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const snap = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  const fmt = (n: number) => (show ? show(n) : String(n))
  const shown = live ?? value

  const move = (sign: 1 | -1) => {
    const cur = liveRef.current ?? value
    const n = snap(cur + sign * step)
    if (n === cur) return false
    liveRef.current = n
    setLive(n)
    setDir(sign > 0 ? 'up' : 'down')
    haptic()
    return true
  }
  const start = (sign: 1 | -1) => {
    window.clearTimeout(timer.current)
    if (!move(sign)) return
    let delay = 420
    const again = () => {
      if (!move(sign)) return
      delay = Math.max(60, delay * 0.8)
      timer.current = window.setTimeout(again, delay)
    }
    timer.current = window.setTimeout(again, delay)
  }
  const stop = () => {
    window.clearTimeout(timer.current)
    const n = liveRef.current
    liveRef.current = null
    setLive(null)
    if (n !== null && n !== value) { prev.current = n; onCommit(n) }
  }
  const btn = (sign: 1 | -1) => (
    <button
      type="button"
      className="sp-btn"
      disabled={sign < 0 ? shown <= min : shown >= max}
      aria-label={`${sign < 0 ? 'Less' : 'More'} ${label}`}
      onPointerDown={(ev) => { if (ev.button === 0) { ev.preventDefault(); start(sign) } }}
      onPointerUp={stop}
      onPointerLeave={() => { if (liveRef.current !== null) stop() }}
      onPointerCancel={stop}
      onContextMenu={(ev) => ev.preventDefault()}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); move(sign); stop() } }}
    >
      {sign < 0 ? '−' : '+'}
    </button>
  )

  const num = (
    <>
      <span key={shown} className={`sp-n ${dir}`}>{fmt(shown)}</span>
      {unit && <small>{unit}</small>}
    </>
  )
  const val = onOpen
    ? <button type="button" className="sp-val" onClick={onOpen} aria-label={`${label}: ${fmt(shown)}${unit ? ` ${unit}` : ''}. Open editor`}>{num}</button>
    : <span className="sp-val" aria-live="polite">{num}</span>
  return (
    <span className={`sp sp-${size}${live !== null ? ' live' : ''}${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {btn(-1)}
      {val}
      {btn(1)}
    </span>
  )
}
