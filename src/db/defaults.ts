import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  targets: {
    training: { kcal: 2400, protein: 150, carbs: 315, fat: 60 },
    rest: { kcal: 2050, protein: 150, carbs: 195, fat: 75 },
  },
  // Sunday and Friday: 5 training + 2 rest days in a Sat→Fri week
  defaultRestDays: [0, 5],
  referenceWeightKg: 74.5,
}
