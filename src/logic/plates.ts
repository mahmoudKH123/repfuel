import type { WeightUnit } from '../db/types'

/** Plates you can tap onto the bar, heaviest first. Each adds its own value to the logged weight. */
export const PLATES: Record<WeightUnit, number[]> = {
  kg: [20, 10, 5, 2.5],
  lbs: [45, 25, 10, 5, 2.5],
}

/** Most plates drawn on the bar; anything heavier shows as the leftover number. */
const MAX_PLATES = 40

/**
 * Splits a weight into plates, heaviest first (greedy). Whatever the plates can't make
 * (e.g. 0.5 of 33 kg) comes back as `rest`. Works in hundredths so 2.5s never drift.
 */
export function loadPlates(weight: number, values: number[]): { plates: number[]; rest: number } {
  let left = Math.max(0, Math.round(weight * 100))
  const plates: number[] = []
  for (const v of values) {
    const c = Math.round(v * 100)
    while (left >= c && plates.length < MAX_PLATES) { plates.push(v); left -= c }
  }
  return { plates, rest: left / 100 }
}

/** Plates plus leftover, rounded to hundredths. */
export function plateTotal(plates: number[], rest: number): number {
  return Math.round(plates.reduce((t, v) => t + v * 100, rest * 100)) / 100
}
