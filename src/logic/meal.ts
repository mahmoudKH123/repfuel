import type { Food, Macros, Unit } from '../db/types'
import { defaultAmount, scaleFood, sum } from './macros'
import { availableUnits, convert, gramsFromLabel, toBase, type AmountUnit, type UnitInfo } from './units'

/** One item as the AI Worker returns it (meal mode). */
export interface AiMealItem extends Macros {
  name: string
  /** Id of the matching saved food, or 0. */
  matchId: number
  /** For matches: how much was eaten, in the saved food's unit. */
  amount: number
  /** For new items: total grams (ml for drinks) eaten. Macros are for this whole amount. */
  eatenGrams: number
  servingLabel: string
  gramsPerServing?: number
  liquid: boolean
  /** You wrote this item's amount in g/ml, so the row shows it that way too. */
  statedWeight?: boolean
  confidence: 'high' | 'medium' | 'low'
  note: string
}

export interface AiMeal {
  name: string
  items: AiMealItem[]
}

/** An item row on the meal screen. Macros in `base` are per `baseAmount` of `baseUnit`. */
export interface MealItem {
  key: string
  name: string
  /** Set when the item is one of your saved foods (your numbers are used, not the AI's). */
  food?: Food
  base: Macros
  baseAmount: number
  baseUnit: Unit
  servingLabel: string
  gramsPerServing?: number
  liquid: boolean
  unit: AmountUnit
  amount: number
  on: boolean
  save: boolean
  estimate: boolean
  confidence: 'high' | 'medium' | 'low'
  note: string
}

/** Serving weight for saved foods: from the label ("1 scoop, 36g"), or the base amount for gram/ml foods. */
export function labelGrams(f: Food): { gramsPerServing?: number; liquid?: boolean } {
  const fromLabel = gramsFromLabel(f.servingLabel)
  if (f.unit === 'serving') return fromLabel ? { gramsPerServing: fromLabel.amount, liquid: fromLabel.liquid } : {}
  if (f.unit === 'g' || f.unit === 'ml') return { liquid: f.unit === 'ml', gramsPerServing: fromLabel && f.servingLabel && !/^\s*\d+\s*(g|ml)\s*$/i.test(f.servingLabel) ? fromLabel.amount : undefined }
  return {}
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Your saved foods as short lines for the AI, so it can match items and reuse your numbers. */
export function foodsContext(foods: Food[], maxChars = 15_000): string {
  const lines: string[] = []
  let size = 0
  for (const f of foods) {
    if (!f.id || f.archived) continue
    const per = f.unit === 'serving' || f.unit === 'spray'
      ? `per ${f.baseAmount} ${f.unit}${f.servingLabel ? ` (${f.servingLabel})` : ''}`
      : `per ${f.baseAmount} ${f.unit}`
    const line = `#${f.id} | ${f.name} | ${per} | ${r1(f.kcal)} kcal, P ${r1(f.protein)} C ${r1(f.carbs)} F ${r1(f.fat)}`
    if (size + line.length + 1 > maxChars) break
    lines.push(line)
    size += line.length + 1
  }
  return lines.join('\n')
}

/** Turns the AI reply into item rows. Matched items use the saved food's own numbers. */
export function buildItems(meal: AiMeal, foods: Food[]): MealItem[] {
  const byId = new Map(foods.filter((f) => f.id && !f.archived).map((f) => [f.id!, f]))
  return meal.items.map((i, n) => {
    const food = i.matchId ? byId.get(i.matchId) : undefined
    if (food) {
      const g = labelGrams(food)
      const liquid = !!g.liquid || food.unit === 'ml'
      // Gram/ml foods take the AI's total weight (its "amount" is sometimes in portions, e.g. 1.3 of "per 160 g").
      const byWeight = food.unit === 'g' || food.unit === 'ml'
      const amount = byWeight && i.eatenGrams > 0 ? i.eatenGrams : i.amount > 0 ? i.amount : defaultAmount(food)
      // Written in grams ("40g whey") on a per-scoop food: show grams when the scoop weight is known.
      const asWeight = i.statedWeight && food.unit === 'serving' && g.gramsPerServing
      return {
        key: `${n}-${food.id}`, name: food.name, food,
        base: { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat },
        baseAmount: food.baseAmount, baseUnit: food.unit,
        servingLabel: food.servingLabel ?? `${food.baseAmount} ${food.unit}`,
        gramsPerServing: g.gramsPerServing, liquid,
        unit: asWeight ? (liquid ? 'ml' : 'g') : food.unit, amount: asWeight ? (i.eatenGrams > 0 ? i.eatenGrams : Math.round(amount * g.gramsPerServing!)) : amount,
        on: true, save: false, estimate: food.estimate, confidence: i.confidence, note: '',
      }
    }
    const base = { kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat }
    const common = { key: `${n}-ai`, name: i.name, base, servingLabel: i.servingLabel || '1 serving', liquid: i.liquid, on: true, save: false, estimate: true, confidence: i.confidence, note: i.note }
    // No weight: the numbers are taken as one serving.
    if (!(i.eatenGrams > 0)) return { ...common, baseAmount: 1, baseUnit: 'serving' as Unit, unit: 'serving' as AmountUnit, amount: 1 }
    const w: 'g' | 'ml' = i.liquid ? 'ml' : 'g'
    const gps = i.gramsPerServing && i.gramsPerServing > 0 ? i.gramsPerServing : undefined
    return {
      ...common, baseAmount: i.eatenGrams, baseUnit: w, gramsPerServing: gps,
      // Countable things show as pieces ("3 eggs"), unless you wrote grams; the rest by weight.
      ...(gps && !i.statedWeight ? { unit: 'serving' as AmountUnit, amount: Math.max(0.25, Math.round((i.eatenGrams / gps) * 4) / 4) } : { unit: w as AmountUnit, amount: i.eatenGrams }),
    }
  })
}

export const itemInfo = (i: MealItem): UnitInfo => ({ base: i.baseUnit, gramsPerServing: i.gramsPerServing, liquid: i.liquid })

export function itemMacros(i: MealItem): Macros {
  return scaleFood({ ...i.base, baseAmount: i.baseAmount }, toBase(i.amount, i.unit, itemInfo(i)))
}

/** Totals of the ticked items. */
export const mealTotals = (items: MealItem[]): Macros => sum(items.filter((i) => i.on).map(itemMacros))

/** Next unit in the row's unit button (servings -> g -> servings…), with the amount converted. */
export function cycleUnit(i: MealItem): Pick<MealItem, 'unit' | 'amount'> {
  const units = availableUnits(itemInfo(i)).filter((u): boolean => u !== 'l')
  if (units.length < 2) return { unit: i.unit, amount: i.amount }
  const next = units[(units.indexOf(i.unit) + 1) % units.length]
  return { unit: next, amount: i.amount > 0 ? convert(i.amount, i.unit, next, itemInfo(i)) : i.amount }
}

/** A new AI item as a saved food: per 100 g/ml (or per serving when there is no weight), serving weight kept in the label. */
export function toFood(i: MealItem): Omit<Food, 'createdAt' | 'updatedAt'> {
  const common = { name: i.name.trim(), category: 'custom' as const, estimate: true, note: i.note || undefined }
  if (i.baseUnit === 'serving') return { ...common, baseAmount: 1, unit: 'serving', servingLabel: i.servingLabel, ...i.base }
  const per100 = scaleFood({ ...i.base, baseAmount: i.baseAmount }, 100)
  const r = (n: number) => Math.round(n * 10) / 10
  const gps = i.gramsPerServing
  const label = gps ? `${i.servingLabel}, ${Math.round(gps)}${i.baseUnit}` : `100 ${i.baseUnit}`
  return { ...common, baseAmount: 100, unit: i.baseUnit, servingLabel: label, kcal: r(per100.kcal), protein: r(per100.protein), carbs: r(per100.carbs), fat: r(per100.fat) }
}
