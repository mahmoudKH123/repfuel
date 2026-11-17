import { useEffect, useRef, type CSSProperties } from 'react'
import type { Macros } from '../db/types'
import { useCountUp, useFill } from './motion'
import { afterIntro } from './introGate'
import { Odometer } from './Odometer'

const k = (v: number) => Math.round(v).toLocaleString('en-US')
const r1 = (v: number) => Math.round(v * 10) / 10

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
] as const

/** Going over, the colour heats up the further past the goal: green at it, then yellow (5% over), orange (15%) and
 *  red (30% and beyond), blended smoothly in between. The shades are theme tokens (--hot1..3 in index.css). */
const HOT: [number, string][] = [[0, 'var(--kcal)'], [0.05, 'var(--hot1)'], [0.15, 'var(--hot2)'], [0.3, 'var(--hot3)']]
function hot(over: number): string {
  if (over >= HOT[HOT.length - 1][0]) return HOT[HOT.length - 1][1]
  const i = Math.max(1, HOT.findIndex(([at]) => over <= at))
  const [a, A] = HOT[i - 1], [b, B] = HOT[i], t = Math.max(0, (over - a) / (b - a))
  return `color-mix(in srgb, ${A} ${((1 - t) * 100).toFixed(1)}%, ${B})`
}

/** Last fill level shown per page, so switching day carries the flow on from where it was. */
const lastLevel = new Map<string, number>()
/** What you've eaten flows up inside the digits: a green liquid with a slow wavy surface, rising with each meal.
 *  Writes the clip straight onto the element every frame (no re-render). Waits for the launch intro. */
function useFlow(ratio: number, memo: string) {
  const ref = useRef<HTMLSpanElement>(null)
  const state = useRef({ level: lastLevel.get(memo) ?? 0, to: lastLevel.get(memo) ?? 0, wob: 0 })
  useEffect(() => afterIntro(() => {
    const s = state.current
    if (ratio > s.to + 0.001) s.wob = 4 // a meal went in: the surface ripples
    s.to = ratio
    lastLevel.set(memo, ratio)
  }), [ratio, memo])
  useEffect(() => {
    let id = 0
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = (t: number) => {
      const s = state.current, el = ref.current
      s.level = still ? s.to : s.level + (s.to - s.level) * 0.05
      s.wob *= 0.97
      if (el) {
        // The digits sit between 12% and 88% of the line box.
        const y = 88 - 76 * s.level
        let pts: string
        if (s.level < 0.003) pts = '0 100%,100% 100%,100% 100%,0 100%'
        else if (s.level > 0.997) pts = '0 -10%,100% -10%,100% 110%,0 110%'
        else {
          const a: string[] = []
          for (let x = 0; x <= 100; x += 5) a.push(`${x}% ${(y + (still ? 0 : Math.sin(x / 9 + t / 520) * 1.6 + Math.sin(x / 5 - t / 330) * s.wob)).toFixed(2)}%`)
          pts = a.join(',') + ',100% 110%,0 110%'
        }
        el.style.clipPath = `polygon(${pts})`
      }
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [])
  return ref
}

/** The day's budget straight on the page: kcal left as the headline (eaten flowing up inside it), one bar, three macros. */
/** `compact` (Today) drops the bar: the number itself shows how full the day is. */
export function Budget({ eaten, target, fatOver, scope = 'today', compact = false }: { eaten: Macros; target: Macros; fatOver: number; scope?: string; compact?: boolean }) {
  const left = target.kcal - eaten.kcal
  const over = left < 0
  // Remembered per page, so switching day rolls the number from its last value instead of restarting at 0.
  const shown = useCountUp(Math.abs(left), 800, 0, `${scope}-left`)
  const ratio = target.kcal ? Math.min(1, eaten.kcal / target.kcal) : 0
  const fill = useFill(ratio, `${scope}-bar`)
  const flow = useFlow(ratio, `${scope}-flow`)
  const kp = eaten.protein * 4, kc = eaten.carbs * 4, kf = eaten.fat * 9
  const tot = kp + kc + kf
  // The bar is coloured by where today's calories came from (P / C / F share), green until something is logged.
  const blend: CSSProperties = tot
    ? { background: `linear-gradient(90deg, var(--protein) 0 ${(kp / tot) * 100}%, var(--carbs) 0 ${((kp + kc) / tot) * 100}%, var(--fat) 0)` }
    : {}
  return (
    <div className={`td-budget${compact ? ' compact' : ''}`}>
      <p className="td-big">
        <span>{k(shown)}</span>
        <span className="td-flow" ref={flow} aria-hidden="true" style={over ? { color: hot(eaten.kcal / target.kcal - 1) } : undefined}>{k(shown)}</span>
      </p>
      <p className="td-cap">{over ? 'kcal over' : 'kcal left'} <span>of {k(target.kcal)}{scope === 'today' ? '' : ` ${scope}`}</span></p>
      {!compact && <div className="td-bar" role="progressbar" aria-label="Calories eaten" aria-valuenow={Math.round(eaten.kcal)} aria-valuemax={Math.round(target.kcal)}>
        <span style={{ width: `${fill * 100}%`, ...blend }} />
      </div>}
      <div className="td-macros">
        {MACROS.map((m, i) => (
          <MacroCol key={m.key} memo={`${scope}-${m.key}`} label={m.label} color={m.color} eaten={eaten[m.key]} goal={target[m.key]} index={i} more={m.key === 'protein'} />
        ))}
      </div>
      {fatOver > 0 && <p className="td-warn">Fat is {r1(fatOver)} g over {scope}</p>}
    </div>
  )
}

function MacroCol({ label, color, eaten, goal, index, memo, more }: { label: string; color: string; eaten: number; goal: number; index: number; memo: string; more: boolean }) {
  const fill = useFill(goal ? Math.min(1, eaten / goal) : 0, memo)
  const left = Math.round(goal - eaten)
  // Protein past its goal is fine; carbs and fat count as hit within 5%, then turn to "over".
  const hit = goal > 0 && left <= 0 && (more || -left <= goal * 0.05)
  const state = hit ? 'hit' : left < 0 ? 'over' : 'left'
  // Its own colour until it's really over, then the heat scale.
  const c = state === 'over' ? hot(eaten / goal - 1) : color
  return (
    <div className="td-macro" style={{ '--c': c } as CSSProperties}>
      <span className="td-macro-label">{label}</span>
      <span className={`td-macro-val${state === 'over' ? ' over' : ''}`}>{k(eaten)}<small> / {k(goal)} g</small></span>
      <span className="td-macro-track"><span style={{ width: `${fill * 100}%`, background: c, transitionDelay: `${0.15 + index * 0.08}s` }} /></span>
      <span className={`td-left ${state}`} aria-label={hit ? `${label} goal hit` : left < 0 ? `${-left} g over` : `${left} g left`}>
        {hit ? (
          <span key="hit" className="td-left-hit" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {more && left < 0 ? 'Goal hit' : 'On target'}
          </span>
        ) : (
          <span key="num" aria-hidden="true">
            <Odometer value={Math.abs(left)} memo={`${memo}-left`} delay={0.2 + index * 0.06} /> g {left < 0 ? 'over' : 'left'}
          </span>
        )}
      </span>
    </div>
  )
}
