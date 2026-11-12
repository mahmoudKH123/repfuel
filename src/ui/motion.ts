import { useEffect, useRef, useState, type TouchEvent } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animates a number from its previous value to the new one (once per change). */
export function useCountUp(value: number, ms = 700, delay = 0): number {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    const start = performance.now() + delay
    const a = from.current
    let id = 0
    const step = (t: number) => {
      const k = reduced() ? 1 : Math.max(0, Math.min(1, (t - start) / ms))
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3))
      setShown(v)
      from.current = v
      if (k < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [value, ms, delay])
  return shown
}

/** Starts at 0 and animates to `ratio` after mount, so bars and rings fill on open. */
export function useFill(ratio: number): number {
  const [r, setR] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setR(ratio))
    return () => cancelAnimationFrame(id)
  }, [ratio])
  return r
}

export const clamp = (v: number) => Math.max(0, Math.min(1, v))
/** Calls onLeft/onRight for a clear horizontal swipe; ignores vertical scrolling. */
export function useSwipe(onLeft: () => void, onRight: () => void, stop = false) {
  const g = useRef<{ x: number; y: number; lx: number; ly: number } | null>(null)
  const finish = (e: TouchEvent) => {
    if (stop) e.stopPropagation()
    const s = g.current
    g.current = null
    if (!s) return
    const t = e.changedTouches[0]
    if (e.type === 'touchend' && t) { s.lx = t.clientX; s.ly = t.clientY }
    const dx = s.lx - s.x
    const dy = s.ly - s.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)()
  }
  return {
    onTouchStart: (e: TouchEvent) => {
      if (stop) e.stopPropagation()
      const t = e.touches[0]
      g.current = { x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY }
    },
    onTouchMove: (e: TouchEvent) => {
      const s = g.current
      if (!s) return
      const t = e.touches[0]
      s.lx = t.clientX
      s.ly = t.clientY
    },
    onTouchEnd: finish,
    onTouchCancel: finish,
  }
}
