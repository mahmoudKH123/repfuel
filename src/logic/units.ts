import type { Unit } from '../db/types'

/** Units you can pick when logging. 'l' is display-only and is stored as ml. */
export type AmountUnit = 'serving' | 'g' | 'ml' | 'l' | 'spray'

export interface UnitInfo {
  /** The unit the food's macros are stored per. */
  base: Unit
  /** Weight (or volume, for drinks) of one serving, when known. */
  gramsPerServing?: number
  liquid: boolean
}

const NOUNS = ['piece', 'slice', 'cup', 'scoop', 'plate', 'sandwich', 'bar', 'egg', 'can', 'bottle', 'pack', 'bowl', 'wrap', 'glass', 'stick', 'tbsp', 'tsp']

/** "1 slice, 30g" -> "slice". Falls back to "serving". */
export function servingNoun(label = ''): string {
  const l = label.toLowerCase()
  const known = NOUNS.find((n) => new RegExp(`\\b${n}(e?s)?\\b`).test(l))
  if (known) return known
  // "1 banana" / "1 medium banana" -> "banana" (one optional size word, nothing else).
  return l.trim().match(/^1\s+(?:[a-z]+\s+)?([a-z]{3,})$/)?.[1] ?? 'serving'
}

const plural = (n: string) => (n === 'sandwich' ? 'sandwiches' : n === 'glass' ? 'glasses' : n.endsWith('s') ? n : n + 's')

/** Grams (or ml) in one serving, read from a label like "1 scoop, 36g" or "180g cup". Mixed labels ("200ml milk + 1 scoop") are ignored. */
export function gramsFromLabel(label = ''): { amount: number; liquid: boolean } | undefined {
  if (label.includes('+')) return undefined
  const m = label.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i)
  if (!m) return undefined
  const amount = Number(m[1])
  return amount > 0 ? { amount, liquid: m[2].toLowerCase() === 'ml' } : undefined
}

export function availableUnits(info: UnitInfo): AmountUnit[] {
  if (info.base === 'spray') return ['spray']
  const weight: AmountUnit[] = info.liquid || info.base === 'ml' ? ['ml', 'l'] : ['g']
  if (info.base === 'serving') return info.gramsPerServing ? ['serving', ...weight] : ['serving']
  return info.gramsPerServing ? ['serving', ...weight] : weight
}

/** How many base units one of `unit` is. */
function perBase(unit: AmountUnit, info: UnitInfo): number {
  const gps = info.gramsPerServing ?? 0
  const grams = unit === 'l' ? 1000 : 1
  if (info.base === 'serving' || info.base === 'spray') return unit === 'serving' || unit === 'spray' ? 1 : gps ? grams / gps : 0
  return unit === 'serving' ? gps : grams
}

/** Amount in the food's base unit (what macros are scaled by). */
export const toBase = (amount: number, unit: AmountUnit, info: UnitInfo) => amount * perBase(unit, info)

const ROUND: Record<AmountUnit, number> = { serving: 0.25, g: 1, ml: 5, l: 0.05, spray: 1 }
const roundTo = (v: number, step: number) => Math.round(Math.round(v / step) * step * 100) / 100

/** Converts an amount between units, rounded to a sensible step (whole grams, quarter servings…). */
export function convert(amount: number, from: AmountUnit, to: AmountUnit, info: UnitInfo): number {
  if (from === to) return amount
  const p = perBase(to, info)
  if (!p) return amount
  return Math.max(ROUND[to], roundTo(toBase(amount, from, info) / p, ROUND[to]))
}

export const STEP: Record<AmountUnit, number> = { serving: 0.5, g: 10, ml: 25, l: 0.1, spray: 1 }

export function quickAmounts(unit: AmountUnit, info: UnitInfo): number[] {
  if (unit === 'serving') return [0.5, 1, 1.5, 2]
  if (unit === 'spray') return [1, 2, 3, 5]
  if (unit === 'l') return [0.25, 0.5, 1, 1.5]
  const list = unit === 'ml' ? [100, 200, 250, 500] : [50, 100, 150, 200]
  const gps = info.gramsPerServing
  // One serving's weight is the most likely pick, so it joins the chips.
  if (gps && !list.includes(Math.round(gps))) { list.push(Math.round(gps)); list.sort((a, b) => a - b) }
  return list
}

/** Unit name for buttons (short, plural) or next to a number (singular for 1 or less). */
export function unitName(unit: AmountUnit, noun: string, short = false, qty = 2): string {
  const one = !short && qty > 0 && qty <= 1
  if (unit === 'serving') return short ? cap(plural(noun)) : one ? noun : plural(noun)
  if (unit === 'l') return 'L'
  if (unit === 'spray') return short ? 'Sprays' : one ? 'spray' : 'sprays'
  return unit
}

export const fmtQty = (v: number, unit: AmountUnit) =>
  unit === 'serving' ? (v === 0.5 ? '½' : v === 1.5 ? '1½' : v === 0.25 ? '¼' : String(v)) : `${v} ${unit === 'l' ? 'L' : unit === 'spray' ? '' : unit}`.trim()

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** What gets stored on the log entry: litres are saved as ml so existing units keep working. */
export function toStored(amount: number, unit: AmountUnit): { amount: number; unit: Unit } {
  return unit === 'l' ? { amount: Math.round(amount * 1000), unit: 'ml' } : { amount, unit }
}
