import { useEffect, useRef, useState } from 'react'
import type { Entry } from '../db/types'
import { afterIntro } from './introGate'

const k = (v: number) => Math.round(v).toLocaleString('en-US')

// Geometry (viewBox units). The bar is held at the middle; the ends droop under the load like a real bar.
const W = 360
const TOP = 18 // drawing is cropped to the plates (y 20–112) plus room for the bend below
const H = 108
const CY = 66
const MID = W / 2
const HALF = MID - 4 // middle to rod end
const BEND = 22 // end droop at the day's target
const MAX_BEND = 36
const GRIP_L = 140
const GRIP_R = 220
const COLLAR_L = 70 // left collar's left edge; the right side mirrors it
const COLLAR = 8
// Each side carries the same load, from the collar out: big, big, medium.
const LOAD = [{ w: 16, h: 92, c: 'a' }, { w: 16, h: 92, c: 'a' }, { w: 12, h: 68, c: 'b' }]
const GAP = 2

/** How far the bar droops at x, and the angle of the rod there (a parabola, held at the middle). */
const dropAt = (x: number, d: number) => d * ((x - MID) / HALF) ** 2
const angleAt = (x: number, d: number) => (Math.atan((2 * d * (x - MID)) / HALF ** 2) * 180) / Math.PI
/** Puts a part centred at x onto the bent rod. */
const onRod = (x: number, d: number) => `translate(0 ${dropAt(x, d).toFixed(2)}) rotate(${angleAt(x, d).toFixed(2)} ${x} ${CY})`
const rodPath = (d: number) => {
  const pts: string[] = []
  for (let x = 4; x <= W - 4; x += 8) pts.push(`${x} ${(CY + dropAt(x, d)).toFixed(2)}`)
  return `M${pts.join(' L')}`
}

/** Springs the bend to `goal` with a small whip, like a loaded bar settling. Waits for the launch intro and the
 *  plates to slide on first; after that a new food bends it straight from where it is. */
function useBend(goal: number): number {
  const [d, setD] = useState(0)
  const cur = useRef(0)
  const first = useRef(true)
  useEffect(() => {
    let raf = 0
    let wait = 0
    const cancel = afterIntro(() => {
      const from = cur.current
      const settle = (v: number) => { cur.current = v; setD(v) }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { settle(goal); return }
      let t0 = 0
      const tick = (now: number) => {
        if (!t0) t0 = now
        const p = Math.min(1, (now - t0) / 1100)
        const e = p < 1 ? 1 - Math.exp(-5 * p) * Math.cos(10 * p) : 1
        settle(from + (goal - from) * e)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      const delay = first.current ? (document.documentElement.dataset.intro === 'fly' ? 1150 : 900) : 0
      first.current = false
      wait = window.setTimeout(() => { raf = requestAnimationFrame(tick) }, delay)
    })
    return () => { cancel(); window.clearTimeout(wait); cancelAnimationFrame(raf) }
  }, [goal])
  return d
}

/** The day as a loaded barbell that bends under what you've eaten: straight at 0, a full bend at your target
 *  (where the rod meets the dashed line), and past it the bar sags further and its ends turn warm. */
export function Barbell({ entries, target }: { entries: Entry[]; target: number }) {
  const total = entries.reduce((s, e) => s + Math.max(0, e.kcal), 0)
  const f = target > 0 ? total / target : 0
  const over = f > 1
  const d = useBend(over ? Math.min(MAX_BEND, BEND + (f - 1) * 40) : BEND * f)

  // Plate centres, collar outwards; the right side mirrors the left.
  const plates: { x: number; w: number; h: number; c: string; i: number }[] = []
  for (const [i, p] of LOAD.entries()) {
    const right = i === 0 ? COLLAR_L : plates[i - 1].x - plates[i - 1].w / 2 - GAP
    plates.push({ x: right - p.w / 2, w: p.w, h: p.h, c: p.c, i })
  }
  const mirror = (x: number) => W - x
  const pct = Math.round(f * 100)

  return (
    <div className={`bb${over ? ' over' : ''}`} role="img" aria-label={`Bar bent to ${pct}% of a full day: ${k(total)} of ${k(target)} kcal`}>
      <svg viewBox={`0 ${TOP} ${W} ${H}`} aria-hidden="true">
        <path className="bb-target" d={rodPath(BEND)} />
        <path className="bb-rod" d={rodPath(d)} />
        {[4, W - 4].map((x) => (
          <g key={x} transform={onRod(x, d)}>
            <rect className="bb-end" x={x - 3} y={CY - 7} width="6" height="14" rx="2.5" />
          </g>
        ))}
        <rect className="bb-grip" x={GRIP_L} y={CY - 11} width={GRIP_R - GRIP_L} height="22" rx="5" />
        <text className="bb-mark" x={MID} y={CY + 4.2} textAnchor="middle">R</text>
        {[COLLAR_L + COLLAR / 2, mirror(COLLAR_L + COLLAR / 2)].map((x) => (
          <g key={x} transform={onRod(x, d)}>
            <rect className="bb-collar" x={x - COLLAR / 2} y={CY - 24} width={COLLAR} height="48" rx="3" />
          </g>
        ))}
        {plates.flatMap((p) => [
          { ...p, side: 'l', cx: p.x },
          { ...p, side: 'r', cx: mirror(p.x) },
        ]).map((p) => (
          <g key={`${p.side}${p.i}`} transform={onRod(p.cx, d)}>
            <rect
              className={`bb-plate ${p.side} ${p.c}`} style={{ animationDelay: `${0.45 + p.i * 0.09}s` }}
              x={p.cx - p.w / 2} y={CY - p.h / 2} width={p.w} height={p.h} rx="3.5"
            />
          </g>
        ))}
      </svg>
    </div>
  )
}
