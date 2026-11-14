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
          <MacroCol key={m.key} memo={`${scope}-${m.key}`} label={m.label} color={m.color} eaten={eaten[m.key]} goal={target[m.key]} index={i} />
        ))}
      </div>
      {fatOver > 0 && <p className="td-warn">Fat is {r1(fatOver)} g over {scope}</p>}
    </div>
  )
}

function MacroCol({ label, color, eaten, goal, index, memo }: { label: string; color: string; eaten: number; goal: number; index: number; memo: string }) {
  const fill = useFill(goal ? Math.min(1, eaten / goal) : 0, memo)
  const over = goal > 0 && eaten > goal
  return (
    <div className="td-macro">
      <span className="td-macro-label">{label}</span>
      <span className={`td-macro-val${over ? ' over' : ''}`}>{k(eaten)}<small> / {k(goal)} g</small></span>
      <span className="td-macro-track"><span style={{ width: `${fill * 100}%`, background: color, transitionDelay: `${0.15 + index * 0.08}s` }} /></span>
    </div>
  )
}

