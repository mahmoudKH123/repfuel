export type Unit = 'serving' | 'g' | 'ml' | 'spray'
export type FoodCategory = 'branded' | 'home' | 'combo' | 'restaurant' | 'custom'
export type DayType = 'training' | 'rest'

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** A saved food. Macros are for `baseAmount` of `unit` (e.g. 100 g, or 1 serving). */
export interface Food extends Macros {
  id?: number
  /** Stable key for foods that came from the built-in seed list, so later seed updates can find them. */
  seedKey?: string
  name: string
  category: FoodCategory
  baseAmount: number
  unit: Unit
  /** Human description of the base amount, e.g. "180g cup". */
  servingLabel?: string
  estimate: boolean
  needsReview?: boolean
  note?: string
  archived?: 0 | 1
  createdAt: number
  updatedAt: number
}

/** A logged item. Macros are a snapshot, so editing a food later never rewrites history. */
export interface Entry extends Macros {
  id?: number
  /** Local date, YYYY-MM-DD */
  date: string
  foodId?: number
  name: string
  amount: number
  unit: Unit
  estimate: boolean
  createdAt: number
}

/** Only stored when a day's type differs from the default schedule. */
export interface DayOverride {
  date: string
  type: DayType
}

export interface WeightLog {
  date: string
  kg: number
}

export interface Settings {
  targets: Record<DayType, Macros>
  /** JS weekday numbers (0 = Sunday) that are rest days by default. */
  defaultRestDays: number[]
  referenceWeightKg: number
}

export interface SettingRow {
  key: 'settings'
  value: Settings
}
