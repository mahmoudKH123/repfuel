import { useId, type CSSProperties } from 'react'
import { addWater } from '../db/repo'
import { undoable } from '../db/undo'
import { useCountUp, useFill } from './motion'
import { Odometer } from './Odometer'

const DRINKS = [500, 600, 1000]

// A bottle lying on its side (viewBox units), cap to the right; a litre scale on the left. Water fills from the
// bottom up like a real bottle on a table: inside runs from y 10 (top) to y 90 (bottom).
const TOP = 10
const BOTTOM = 90
const BOTTLE = 'M50 10 H240 C262 10 268 34 280 36 H288 V64 H280 C268 66 262 90 240 90 H50 Q30 90 30 70 V30 Q30 10 50 10 Z'
const WAVE = 60 // wavelength of the surface's gentle sway
/** The water: a softly waving surface at y 0 and everything below it; moved to the level with translateY. */
const water = (amp: number) => {
  const pts: string[] = []
  for (let x = -WAVE; x <= 320 + WAVE * 2; x += 4) pts.push(`${x} ${(amp * Math.sin((x / WAVE) * Math.PI * 2)).toFixed(2)}`)
  return `M${pts.join(' L')} V${BOTTOM + 10} H${-WAVE} Z`
}
const FRONT = water(1.6)
const BACK = water(2.2)
/** Surface height for a fill share; empty and full push the wave just out of sight. */
const levelY = (fill: number) => (fill <= 0 ? BOTTOM + 4 : fill >= 1 ? TOP - 4 : BOTTOM - fill * (BOTTOM - TOP))
// Bubbles for one drink: x, size, delay; they rise from the bottom to the surface. Fixed so renders stay pure.
const BUBBLES = [[70, 2, 0], [104, 1.4, 0.15], [138, 2.4, 0.05], [170, 1.2, 0.3], [196, 1.8, 0.1], [226, 1.5, 0.22], [120, 1, 0.4]]
const L = (ml: number) => (ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`)
const litres = (ml: number) => (ml / 1000).toFixed(1)

/** Today's water as a bottle lying on its side that fills from the bottom toward your goal (Settings › Targets),
 *  with a litre scale beside it.
 *  The surface sways gently; each drink raises it with a small slosh and sends a few bubbles up. */
export function Water({ date, ml, sips, goal }: { date: string; ml: number; sips: number; goal: number }) {
  const clip = useId()
  const fill = useFill(Math.min(1, ml / goal), 'water')
  const shown = useCountUp(ml, 700, 0, 'water-ml')
  const done = ml >= goal
  const goalL = Math.round(goal / 100) / 10
  // Scale: a mark at each whole litre (every 2 L past 6 L so labels never crowd), plus the goal at the top.
  const every = goal > 6000 ? 2 : 1
  const marks: number[] = []
  for (let n = every; n * 1000 < goal - 150; n += every) marks.push(n)
  marks.push(goalL)
  return (
    <section className="wt" aria-label={`Water: ${litres(ml)} of ${goalL} litres`}>
      {/* Same type as the macros above: small label, rounded number, and what's left (or Goal hit) in the water colour. */}
      <div className="wt-head">
        <div>
          <span className="td-macro-label">Water</span>
          <span className="td-macro-val">{litres(shown)}<small> / {goalL} L</small></span>
        </div>
        <span className={`td-left${done ? ' hit' : ''}`} style={{ '--c': 'var(--water)' } as CSSProperties}>
          {done ? (
            <span key="hit" className="td-left-hit">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              Goal hit
            </span>
          ) : (
            <span key="num"><Odometer value={goal - ml} memo="water-left" delay={0.2} /> ml left</span>
          )}
        </span>
      </div>
      <svg className="wt-bottle" viewBox="0 0 320 100" aria-hidden="true">
        <defs>
          <clipPath id={clip}><path d={BOTTLE} /></clipPath>
          <linearGradient id={`${clip}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="wt-g1" />
            <stop offset="1" className="wt-g2" />
          </linearGradient>
        </defs>
        {marks.map((n) => {
          const y = BOTTOM - ((BOTTOM - TOP) * n * 1000) / goal
          return (
            <g key={n}>
              <line className="wt-tick" x1="23" x2="28" y1={y} y2={y} />
              <text className="wt-label" x="20" y={y + 3} textAnchor="end">{n}L</text>
            </g>
          )
        })}
        <path className="wt-glass" d={BOTTLE} />
        <g clipPath={`url(#${clip})`}>
          <g className="wt-level" style={{ transform: `translateY(${levelY(fill).toFixed(2)}px)` }}>
            <path className="wt-back" d={BACK} />
            <path className="wt-front" d={FRONT} />
            {/* Lit at the surface, deeper toward the bottom; it rises with the water but never sways. */}
            <rect x="0" y="2" width="320" height={BOTTOM} fill={`url(#${clip}g)`} />
          </g>
          {fill > 0.04 && (
            <g key={sips} className="wt-bubbles" style={{ '--rise': `${-(BOTTOM - 6 - levelY(fill) - 4)}px` } as CSSProperties}>
              {BUBBLES.map(([x, r, delay], i) => (
                <circle key={i} cx={x} cy={BOTTOM - 6} r={r} style={{ animationDelay: `${delay}s` }} />
              ))}
            </g>
          )}
        </g>
        <path className="wt-rim" d={BOTTLE} />
        <rect className="wt-shine" x="52" y="16" width="176" height="4" rx="2" />
        <rect className="wt-ring" x="283" y="33" width="6" height="34" rx="1.5" />
        <rect className="wt-cap" x="289" y="30" width="22" height="40" rx="4" />
        {[0, 1, 2, 3].map((i) => <line key={i} className="wt-grip" x1={294 + i * 4.5} x2={294 + i * 4.5} y1="34" y2="66" />)}
      </svg>
      <div className="wt-actions">
        {DRINKS.map((d) => (
          <button key={d} className="wt-add" onClick={() => undoable(`+ ${L(d)} water`, () => addWater(date, d))}>+ {L(d)}</button>
        ))}
      </div>
    </section>
  )
}
