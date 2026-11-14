import type { CSSProperties } from 'react'
import type { Macros } from '../db/types'
import { useCountUp, useFill } from './motion'

const k = (v: number) => Math.round(v).toLocaleString('en-US')
const r1 = (v: number) => Math.round(v * 10) / 10

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
] as const

/** The day's budget straight on the page: kcal left as the headline, one bar, three macros. */
export function Budget({ eaten, target, fatOver, scope = 'today' }: { eaten: Macros; target: Macros; fatOver: number; scope?: string }) {
  const left = target.kcal - eaten.kcal
  const over = left < 0
  // Remembered per page, so switching day rolls the number from its last value instead of restarting at 0.
  const shown = useCountUp(Math.abs(left), 800, 0, `${scope}-left`)
  const ratio = target.kcal ? Math.min(1, eaten.kcal / target.kcal) : 0
  const fill = useFill(ratio, `${scope}-bar`)
  const kp = eaten.protein * 4, kc = eaten.carbs * 4, kf = eaten.fat * 9
  const tot = kp + kc + kf
  // The bar is coloured by where today's calories came from (P / C / F share), green until something is logged.
  const blend: CSSProperties = tot
    ? { background: `linear-gradient(90deg, var(--protein) 0 ${(kp / tot) * 100}%, var(--carbs) 0 ${((kp + kc) / tot) * 100}%, var(--fat) 0)` }
    : {}
  return (
    <div className="td-budget">
      <p className={`td-big${over ? ' over' : ''}`}>{k(shown)}</p>
      <p className="td-cap">{over ? 'kcal over' : 'kcal left'} <span>of {k(target.kcal)}{scope === 'today' ? '' : ` ${scope}`}</span></p>
      <div className="td-bar" role="progressbar" aria-label="Calories eaten" aria-valuenow={Math.round(eaten.kcal)} aria-valuemax={Math.round(target.kcal)}>
        <span style={{ width: `${fill * 100}%`, ...blend }} />
      </div>
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
  const over = goal > 0 && eaten > goal
  const left = Math.round(goal - eaten)
  // Protein past its goal is fine; carbs and fat count as hit within 5%, then turn to "over".
  const hit = goal > 0 && left <= 0 && (more || -left <= goal * 0.05)
  const state = hit ? 'hit' : left < 0 ? 'over' : 'left'
  return (
    <div className="td-macro">
      <span className="td-macro-label">{label}</span>
      <span className={`td-macro-val${over ? ' over' : ''}`}>{k(eaten)}<small> / {k(goal)} g</small></span>
      <span className="td-macro-track"><span style={{ width: `${fill * 100}%`, background: color, transitionDelay: `${0.15 + index * 0.08}s` }} /></span>
      <span className={`td-left ${state}`} style={{ '--c': color } as CSSProperties} aria-label={hit ? `${label} goal hit` : left < 0 ? `${-left} g over` : `${left} g left`}>
        {hit ? (
          <span key="hit" className="td-left-hit" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {more && left < 0 ? 'Goal hit' : 'On target'}
          </span>
        ) : (
          <span key="num" aria-hidden="true">
            <Odometer value={Math.abs(left)} memo={`${memo}-left`} delay={0.25 + index * 0.08} /> g {left < 0 ? 'over' : 'left'}
          </span>
        )}
      </span>
    </div>
  )
}

/** Fuel-pump counter: every digit sits on its own wheel and rolls to the new value, the right-hand digit first. */
function Odometer({ value, memo, delay }: { value: number; memo: string; delay: number }) {
  // Starts from the last value shown (0 on first open) and rolls once it is on screen.
  const v = Math.round(useFill(value, memo))
  const chars = k(v).split('')
  const cells = chars.map((c, i) => {
    if (c === ',') return <span key={`s${chars.length - i}`} className="odo-sep">,</span>
    // Position from the right (0 = units), so wheels keep their place as the number shrinks.
    const p = chars.slice(i + 1).filter((x) => x !== ',').length
    return (
      <span key={`d${p}`} className="odo-wheel">
        <span style={{ transform: `translateY(${-Number(c) * 10}%)`, transitionDelay: `${delay + p * 0.07}s` }}>
          {'0123456789'.split('').map((d) => <i key={d}>{d}</i>)}
        </span>
      </span>
    )
  })
  return <span className="odo">{cells}</span>
}
