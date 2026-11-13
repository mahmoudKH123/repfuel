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
  /** Name shown in the greeting. */
  name?: string
  /** Normal Mon..Sun training week (plan day ids or 'rest'); new weeks start from it. */
  trainingWeek?: string[]
}

export interface SettingRow {
  key: 'settings'
  value: Settings
}

/* ---------- Training ---------- */

export type WeightUnit = 'kg' | 'lbs'

/** A heavier weight being worked towards, e.g. "60-8" = tried 60 kg and got 8 reps. */
export interface Attempt {
  weight: number
  reps: number
}

/** One lift. Shared by every plan day that lists it, so progress shows everywhere. */
export interface Exercise {
  id: string
  name: string
  sets: number
  /** Target reps per set; 0 means "to failure". */
  reps: number
  weight: number
  unit: WeightUnit
  /** Second weight for drop sets, e.g. wrist curls 55 then 30. */
  dropWeight?: number
  next?: Attempt
  updatedAt: number
}

export interface PlanDay {
  id: string
  name: string
  short: string
  order: number
  exerciseIds: string[]
}

/** One row per calendar day you opened a workout on. */
export interface TrainSession {
  date: string
  /** Plan day id that was trained. */
  dayId: string
  done: string[]
  finishedAt?: number
}

/** One Monday-to-Sunday week of the training schedule (created on first open, reshuffled on skips). */
export interface WeekPlan {
  /** Monday, YYYY-MM-DD */
  week: string
  /** First day the app tracked this week; workouts before it are not owed. */
  startedOn: string
  /** Mon..Sun: plan day id or 'rest'. */
  days: string[]
  /** Workouts to fit into this week. */
  owed: string[]
  /** Workouts skipped this week after you confirmed. */
  dropped: string[]
  /** Day indexes you said you can't train. */
  blocked: number[]
  /** Day indexes already handled as missed (so they're not reshuffled twice). */
  missed: number[]
  /** You chose to sort out an overflow yourself; don't ask again this week. */
  declined?: boolean
}
