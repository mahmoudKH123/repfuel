import type { Exercise, PlanDay } from './types'

/** Plan copied from the Apple Notes workout days (13/11/2026). Shared lifts use the lower numbers. */
type Seed = Omit<Exercise, 'updatedAt'>
const x = (id: string, name: string, sets: number, reps: number, weight: number, extra: Partial<Seed> = {}): Seed =>
  ({ id, name, sets, reps, weight, unit: 'kg', ...extra })

export const SEED_EXERCISES: Seed[] = [
  x('incline-smith', 'Incline Smith Barbell Press', 3, 10, 25, { next: { weight: 30, reps: 8 } }),
  x('shoulder-press', 'Shoulder Press Machine', 3, 10, 55, { next: { weight: 60, reps: 8 } }),
  x('chest-fly', 'Chest Fly', 2, 10, 60),
  x('converging-press', 'Converging Chest Press', 2, 10, 40),
  x('lateral-raise', 'Cable Lateral Raises', 3, 12, 15, { next: { weight: 20, reps: 8 } }),
  x('v-tricep', 'V Tricep Overhead', 3, 12, 60, { next: { weight: 65, reps: 10 } }),
  x('tricep-pushdown', 'Unilateral Tricep Pushdown', 3, 10, 35, { next: { weight: 40, reps: 8 } }),
  x('reverse-curl', 'Cable Reverse Curls', 3, 12, 45),
  x('wrist-curl', 'Cable Wrist Curls', 3, 20, 55, { dropWeight: 30 }),
  x('lat-pulldown', 'Wide Grip Lat Pulldown', 3, 10, 70, { next: { weight: 75, reps: 8 } }),
  x('tbar-row', 'T-Bar Cable Rows', 3, 10, 40),
  x('vbar-row', 'V-Bar Cable Rows', 3, 10, 60),
  x('lat-pullover', 'Cable Lat Pullover', 3, 10, 45),
  x('rear-delt', 'Rear Delt Cable Fly', 3, 12, 15, { next: { weight: 20, reps: 8 } }),
  x('kelso-shrug', 'Kelso Shrugs', 3, 10, 40),
  x('bicep-curl', 'Machine Bicep Curls', 3, 10, 30, { next: { weight: 35, reps: 8 } }),
  x('preacher-curl', 'Machine Preacher Curls', 3, 10, 30, { next: { weight: 35, reps: 8 } }),
  x('hammer-curl', 'Cable Rope Hammer Curls', 3, 10, 35),
  x('hip-thrust', 'Hip Thrusts', 3, 12, 40, { next: { weight: 45, reps: 10 } }),
  x('leg-press', 'Leg Press', 3, 12, 55),
  x('leg-curl', 'Seated Leg Curl', 3, 10, 70),
  x('leg-ext', 'Leg Extensions', 3, 12, 155, { unit: 'lbs' }),
  x('back-ext', 'Weighted Back Extensions', 3, 12, 15),
  x('adductor', 'Internal Abductors', 3, 10, 44),
  x('abductor', 'External Abductors', 3, 10, 52),
  x('calf-raise', 'Calf Raises', 3, 20, 55),
  x('incline-crunch', 'Weighted Incline Crunches', 3, 0, 10),
]

export const SEED_PLAN: PlanDay[] = [
  { id: 'push', name: 'Push Day', short: 'Push', order: 0, exerciseIds: ['incline-smith', 'shoulder-press', 'chest-fly', 'converging-press', 'lateral-raise', 'v-tricep', 'tricep-pushdown', 'reverse-curl', 'wrist-curl'] },
  { id: 'pull', name: 'Pull Day', short: 'Pull', order: 1, exerciseIds: ['lat-pulldown', 'tbar-row', 'vbar-row', 'lat-pullover', 'rear-delt', 'kelso-shrug', 'bicep-curl', 'preacher-curl', 'hammer-curl'] },
  { id: 'legs', name: 'Leg Day', short: 'Legs', order: 2, exerciseIds: ['hip-thrust', 'leg-press', 'leg-curl', 'leg-ext', 'back-ext', 'adductor', 'abductor', 'calf-raise', 'incline-crunch'] },
  { id: 'chestback', name: 'Chest & Back', short: 'C&B', order: 3, exerciseIds: ['incline-smith', 'chest-fly', 'converging-press', 'lat-pulldown', 'tbar-row', 'vbar-row', 'lat-pullover', 'kelso-shrug', 'reverse-curl'] },
  { id: 'arms', name: 'Arms & Shoulders', short: 'Arms', order: 4, exerciseIds: ['shoulder-press', 'lateral-raise', 'rear-delt', 'v-tricep', 'tricep-pushdown', 'bicep-curl', 'preacher-curl', 'hammer-curl', 'wrist-curl'] },
]
