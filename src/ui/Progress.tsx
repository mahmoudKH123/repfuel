import type { CSSProperties } from 'react'
import type { Macros } from '../db/types'
import { useCountUp } from './motion'

const fmt = (v: number) => Math.round(v).toLocaleString('en-US')

const S = 164 // ring box size (px)
const W = 16 // ring thickness
const GAP = 2 // space between rings

/**
 * One activity-style ring: tinted track, an arc that brightens along its length,
 * round caps, and a soft shadow on the end cap once it nears or passes a full lap.
 */
function Ring({ index, ratio, color }: { index: number; ratio: number; color: string }) {
  const v = useCountUp(Math.max(0, Math.min(2, ratio)), 1100, 150 + index * 110)
  const r = S / 2 - W / 2 - index * (W + GAP)
  const inner = r - W / 2
  const outer = r + W / 2
  const mask = `radial-gradient(circle, transparent ${inner - 0.5}px, #000 ${inner}px, #000 ${outer}px, transparent ${outer + 0.5}px)`
  const dark = `color-mix(in srgb, ${color} 86%, #000)`
  const light = `color-mix(in srgb, ${color} 84%, #fff)`

  // Colour depends on the position around the full circle (like Apple's rings),
  // so short arcs stay even and the end cap matches the arc under it.
  const lap = v >= 1
  const deg = (lap ? v - 1 : v) * 360
  const end = `color-mix(in srgb, ${light} ${((deg / 360) * 100).toFixed(1)}%, ${dark})`
  const arc = lap
    ? `conic-gradient(${dark}, ${light})`
    : `conic-gradient(${dark} 0deg, ${end} ${deg}deg, transparent ${deg}deg)`
  const rad = (deg * Math.PI) / 180
  const cap = (x: number, y: number, bg: string): CSSProperties => ({
    left: x - W / 2, top: y - W / 2, width: W, height: W, background: bg,
  })
  const show = v > 0.004

  return (
    <>
      <div className="ring-layer ring-track" style={{ background: color, WebkitMaskImage: mask, maskImage: mask }} />
      {show && <div className="ring-layer" style={{ background: arc, WebkitMaskImage: mask, maskImage: mask }} />}
      {show && <span className="ring-cap" style={cap(S / 2, S / 2 - r, dark)} />}
      {show && (
        <span
          className={`ring-cap${v > 0.94 ? ' ring-cap-end' : ''}`}
          style={cap(S / 2 + r * Math.sin(rad), S / 2 - r * Math.cos(rad), end)}
        />
      )}
    </>
  )
}

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
] as const

/** Activity-style summary: four rings on the left, the numbers in a column on the right. */
export function MacroRings({ eaten, target }: { eaten: Macros; target: Macros }) {
  const left = target.kcal - eaten.kcal
  const over = left < 0
  const shown = useCountUp(Math.abs(left))
  const ratio = (k: keyof Macros) => (target[k] ? eaten[k] / target[k] : 0)
  const kcalColor = over ? 'var(--fat)' : 'var(--kcal)'
  return (
    <div className="summary">
      <div className="rings" style={{ width: S, height: S }} aria-hidden="true">
        <Ring index={0} ratio={ratio('kcal')} color={kcalColor} />
        {MACROS.map((m, i) => <Ring key={m.key} index={i + 1} ratio={ratio(m.key)} color={m.color} />)}
      </div>
      <div className="stats-col">
        <div className="stat-big">
          <strong className={over ? 'over' : ''}>{fmt(shown)}</strong>
          <span>{over ? 'kcal over' : 'kcal left'}</span>
        </div>
        <dl className="stat-lines">
          <div><dt>Calories</dt><dd style={{ color: kcalColor }}>{fmt(eaten.kcal)}<small>/{fmt(target.kcal)}</small></dd></div>
          {MACROS.map((m) => (
            <div key={m.key}>
              <dt>{m.label}</dt>
              <dd style={{ color: m.color }}>{fmt(eaten[m.key])}<small>/{fmt(target[m.key])}g</small></dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
