import { useEffect, useId, useRef, useState } from 'react'
import type { Entry } from '../db/types'
import { afterIntro } from './introGate'
import { R_PATH } from './mark'

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
const GRIP_H = 26 // the grip is the app mark: logo tile colours with its R; the launch intro lands here
const R_H = 16 // R height on the grip
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

/** Last bend shown, kept for the whole app session: coming back to Today (or switching day) carries on from here
 *  instead of loading the bar again. null = the bar hasn't been shown yet. */
let lastBend: number | null = null

/** Springs the bend to `goal` with a small whip, like a loaded bar settling. The first time, it waits for the launch
 *  morph (or the plates sliding on); after that it only moves when the food changes, straight from where it is. */
function useBend(goal: number): number {
  const [d, setD] = useState(() => lastBend ?? 0)
  const cur = useRef(d)
  useEffect(() => {
    let raf = 0
    let wait = 0
    const cancel = afterIntro(() => {
      const from = cur.current
      const settle = (v: number) => { cur.current = v; lastBend = v; setD(v) }
      if (from === goal) { settle(goal); return }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { settle(goal); return }
      let t0 = 0
      const tick = (now: number) => {
        if (!t0) t0 = now
        const p = Math.min(1, (now - t0) / 1100)
        const e = p < 1 ? 1 - Math.exp(-5 * p) * Math.cos(10 * p) : 1
        settle(from + (goal - from) * e)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      // First time: a beat after the launch morph lands (cold start; this runs at the landing), or after the plates slide on.
      const delay = lastBend === null ? ('landed' in document.documentElement.dataset ? 220 : 900) : 0
      lastBend = from // claimed: a remount mid-way won't wait or replay the plates again
      wait = window.setTimeout(() => { raf = requestAnimationFrame(tick) }, delay)
    })
    return () => { cancel(); window.clearTimeout(wait); cancelAnimationFrame(raf) }
  }, [goal])
  return d
}

/** The day as a loaded barbell that bends under what you've eaten: straight at 0, a full bend at your target,
 *  and past it the bar sags further and its ends turn warm. */
export function Barbell({ entries, target }: { entries: Entry[]; target: number }) {
  const total = entries.reduce((s, e) => s + Math.max(0, e.kcal), 0)
  const f = target > 0 ? total / target : 0
  const over = f > 1
  const [first] = useState(() => lastBend === null) // plates slide on only the first time the bar appears
  const d = useBend(over ? Math.min(MAX_BEND, BEND + (f - 1) * 40) : BEND * f)

  // Plate centres, collar outwards; the right side mirrors the left.
  const plates: { x: number; w: number; h: number; c: string; i: number }[] = []
  for (const [i, p] of LOAD.entries()) {
    const right = i === 0 ? COLLAR_L : plates[i - 1].x - plates[i - 1].w / 2 - GAP
    plates.push({ x: right - p.w / 2, w: p.w, h: p.h, c: p.c, i })
  }
  const tile = useId()
  const mirror = (x: number) => W - x
  const pct = Math.round(f * 100)

  return (
    <div className={`bb${over ? ' over' : ''}${first ? ' bb-in' : ''}`} role="img" aria-label={`Bar bent to ${pct}% of a full day: ${k(total)} of ${k(target)} kcal`}>
      <svg viewBox={`0 ${TOP} ${W} ${H}`} aria-hidden="true">
        <path className="bb-rod" d={rodPath(d)} />
        {[4, W - 4].map((x) => (
          <g key={x} transform={onRod(x, d)}>
            <rect className="bb-end" x={x - 3} y={CY - 7} width="6" height="14" rx="2.5" />
          </g>
        ))}
        <defs>
          <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--logo-bg1)' }} />
            <stop offset="1" style={{ stopColor: 'var(--logo-bg2)' }} />
          </linearGradient>
        </defs>
        <g className="bb-logo">
          <rect className="bb-grip" x={GRIP_L} y={CY - GRIP_H / 2} width={GRIP_R - GRIP_L} height={GRIP_H} rx="8" fill={`url(#${tile})`} />
          {/* The pop-in goes on the wrapper: a CSS animated transform replaces an SVG transform attribute (Safari). */}
          <g className="bb-r">
            <path d={R_PATH} fillRule="evenodd" transform={`translate(${MID} ${CY}) scale(${R_H / 420}) translate(-516 -390)`} />
          </g>
        </g>
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
