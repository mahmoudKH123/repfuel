import type { Macros, Unit } from '../db/types'

const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })

/** "2,400 / 150P / 315C / 60F" — the same shorthand used in the tracking notes. */
export function fmtMacros(m: Macros): string {
  return `${Math.round(m.kcal).toLocaleString('en-US')} / ${n(m.protein)}P / ${n(m.carbs)}C / ${n(m.fat)}F`
}

export function fmtAmount(amount: number, unit: Unit): string {
  if (unit === 'serving') return amount === 1 ? '1 serving' : `${n(amount)} servings`
  if (unit === 'spray') return amount === 1 ? '1 spray' : `${n(amount)} sprays`
  return `${n(amount)}${unit}`
}

export const unitLabel = (unit: Unit) => (unit === 'serving' ? 'servings' : unit === 'spray' ? 'sprays' : unit)
