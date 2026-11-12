import type { Macros } from '../db/types'
import { useCountUp } from './motion'

const fmt = (v: number) => Math.round(v).toLocaleString('en-US')

const S = 148 // ring box size (px)
const W = 14 // ring thickness

/** One calm calorie ring: grey track, a single flat arc with round caps, fills once on open. */
function KcalRing({ ratio, over }: { ratio: number; over: boolean }) {
  const v = useCountUp(Math.max(0, Math.min(1, ratio)), 1000, 150)
  const r = (S - W) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className="kring" width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
      <circle cx={S / 2} cy={S / 2} r={r} className="kring-track" strokeWidth={W} />
      {v > 0.003 && (
        <circle
          cx={S / 2} cy={S / 2} r={r} strokeWidth={W}
          className={`kring-arc${over ? ' over' : ''}`}
          strokeDasharray={`${v * c} ${c}`}
        />
      )}
    </svg>
  )
}

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
] as const

/** Summary: one calorie ring (kcal left inside) on the left, macro bars on the right. */
export function MacroRings({ eaten, target }: { eaten: Macros; target: Macros }) {
  const left = target.kcal - eaten.kcal
  const over = left < 0
  const shown = useCountUp(Math.abs(left))
  const ratio = (k: keyof Macros) => (target[k] ? eaten[k] / target[k] : 0)
  return (
    <div className="summary">
      <div className="kring-wrap" style={{ width: S, height: S }}>
        <KcalRing ratio={ratio('kcal')} over={over} />
        <div className="kring-center">
          <strong className={over ? 'over' : ''}>{fmt(shown)}</strong>
          <span>{over ? 'kcal over' : 'kcal left'}</span>
          <small>{fmt(eaten.kcal)} / {fmt(target.kcal)}</small>
        </div>
      </div>
      <dl className="macro-bars">
        {MACROS.map((m, i) => (
          <MacroBar key={m.key} index={i} label={m.label} color={m.color} value={eaten[m.key]} goal={target[m.key]} />
        ))}
      </dl>
    </div>
  )
}

function MacroBar({ index, label, color, value, goal }: { index: number; label: string; color: string; value: number; goal: number }) {
  const v = useCountUp(goal ? Math.max(0, Math.min(1, value / goal)) : 0, 900, 250 + index * 90)
  return (
    <div className="mbar">
      <div className="mbar-head">
        <dt>{label}</dt>
        <dd><b style={{ color }}>{fmt(value)}</b><small>/{fmt(goal)}g</small></dd>
      </div>
      <div className="mbar-track"><div className="mbar-fill" style={{ background: color, width: `${v * 100}%` }} /></div>
    </div>
  )
}
