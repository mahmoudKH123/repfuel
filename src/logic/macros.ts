import type { Food, Macros } from '../db/types'

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
const KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const

export const round1 = (n: number) => Math.round(n * 10) / 10

const map = (fn: (k: (typeof KEYS)[number]) => number): Macros =>
  Object.fromEntries(KEYS.map((k) => [k, round1(fn(k))])) as unknown as Macros

export const add = (a: Macros, b: Macros): Macros => map((k) => a[k] + b[k])
export const sub = (a: Macros, b: Macros): Macros => map((k) => a[k] - b[k])
export const times = (a: Macros, n: number): Macros => map((k) => a[k] * n)
export const sum = (items: Macros[]): Macros => items.reduce(add, ZERO)
export const pick = (m: Macros): Macros => map((k) => m[k])

/** Macros for `amount` of a food whose values are stored per `baseAmount`. */
export function scaleFood(food: Pick<Food, keyof Macros | 'baseAmount'>, amount: number): Macros {
  if (!(food.baseAmount > 0) || !(amount > 0)) return ZERO
  return times(food, amount / food.baseAmount)
}

/** Default amount to prefill when logging a food: one serving, or the base weight. */
export function defaultAmount(food: Pick<Food, 'baseAmount' | 'unit'>): number {
  return food.unit === 'serving' ? 1 : food.baseAmount
}

/** Calories implied by the macros (4/4/9), used to catch data-entry mistakes. */
export const kcalFromMacros = (m: Macros) => m.protein * 4 + m.carbs * 4 + m.fat * 9

/** True when stated kcal is far from what the macros add up to. */
export function kcalLooksWrong(m: Macros): boolean {
  const implied = kcalFromMacros(m)
  return implied > 20 && Math.abs(m.kcal - implied) / implied > 0.25
}
