import { describe, expect, it } from 'vitest'
import type { Food } from '../db/types'
import { buildItems, cycleUnit, foodsContext, itemMacros, mealTotals, toFood, type AiMeal, type AiMealItem } from './meal'

const now = 0
const yogurt: Food = { id: 7, name: 'Greek yogurt', category: 'branded', baseAmount: 100, unit: 'g', servingLabel: '1 cup, 170g', kcal: 100, protein: 10, carbs: 4, fat: 5, estimate: false, archived: 0, createdAt: now, updatedAt: now }
const scoop: Food = { id: 9, name: 'Whey', category: 'branded', baseAmount: 1, unit: 'serving', servingLabel: '1 scoop, 36g', kcal: 140, protein: 25, carbs: 4, fat: 2, estimate: false, archived: 0, createdAt: now, updatedAt: now }

const ai = (o: Partial<AiMealItem>): AiMealItem => ({
  name: 'Egg', matchId: 0, amount: 0, eatenGrams: 100, servingLabel: '1 egg', gramsPerServing: 50, liquid: false,
  kcal: 150, protein: 12, carbs: 1, fat: 10, confidence: 'high', note: '', ...o,
})

describe('meal breakdown', () => {
  it('lists saved foods for the AI with their basis', () => {
    const txt = foodsContext([yogurt, scoop, { ...scoop, id: 10, archived: 1 }])
    expect(txt).toBe('#7 | Greek yogurt | per 100 g | 100 kcal, P 10 C 4 F 5\n#9 | Whey | per 1 serving (1 scoop, 36g) | 140 kcal, P 25 C 4 F 2')
    expect(foodsContext([yogurt, scoop], 60).split('\n')).toHaveLength(1)
  })

  it('uses your saved numbers for matched items, AI numbers for new ones', () => {
    const meal: AiMeal = { name: 'Breakfast', items: [ai({}), ai({ name: 'Yogurt', matchId: 7, amount: 170, eatenGrams: 170, kcal: 999 }), ai({ matchId: 404, name: 'Ghost' })] }
    const [egg, yog, ghost] = buildItems(meal, [yogurt, scoop])
    expect(itemMacros(egg)).toEqual({ kcal: 150, protein: 12, carbs: 1, fat: 10 })
    expect(yog.food?.id).toBe(7)
    expect(yog.unit).toBe('g')
    expect(itemMacros(yog).kcal).toBeCloseTo(170)
    expect(ghost.food).toBeUndefined() // unknown id falls back to the AI's numbers
    expect(egg.save).toBe(false)
  })

  it('totals only ticked items', () => {
    const items = buildItems({ name: 'M', items: [ai({}), ai({ matchId: 9, amount: 1 })] }, [scoop])
    expect(mealTotals(items).kcal).toBe(290)
    items[0].on = false
    expect(mealTotals(items).kcal).toBe(140)
  })

  it('switches a row between servings and grams', () => {
    const [egg] = buildItems({ name: 'M', items: [ai({})] }, [])
    const g = cycleUnit(egg)
    expect(g).toEqual({ unit: 'g', amount: 100 })
    expect(itemMacros({ ...egg, ...g }).kcal).toBe(150)
    expect(cycleUnit({ ...egg, ...g })).toEqual({ unit: 'serving', amount: 2 })
    const [rice] = buildItems({ name: 'M', items: [ai({ name: 'Rice', gramsPerServing: 0, eatenGrams: 250, kcal: 325 })] }, [])
    expect(rice).toMatchObject({ unit: 'g', amount: 250 })
    expect(cycleUnit(rice)).toEqual({ unit: 'g', amount: 250 })
  })

  it('keeps grams when you wrote grams', () => {
    const [banana, whey] = buildItems({ name: 'M', items: [ai({ name: 'Banana', statedWeight: true, eatenGrams: 120, gramsPerServing: 118, servingLabel: '1 banana', kcal: 107 }), ai({ matchId: 9, amount: 40 / 36, eatenGrams: 40, statedWeight: true })] }, [scoop])
    expect(banana).toMatchObject({ unit: 'g', amount: 120 })
    expect(cycleUnit(banana)).toEqual({ unit: 'serving', amount: 1 })
    expect(whey).toMatchObject({ unit: 'g', amount: 40 })
    expect(itemMacros(whey).kcal).toBeCloseTo(155.6, 1)
  })

  it('uses total grams for saved gram foods even if the AI counts portions', () => {
    const rice: Food = { ...yogurt, id: 11, name: 'Rice', baseAmount: 160, unit: 'g', servingLabel: '160 g', kcal: 208 }
    const [r] = buildItems({ name: 'M', items: [ai({ matchId: 11, amount: 1.3, eatenGrams: 200, statedWeight: true })] }, [rice])
    expect(r).toMatchObject({ unit: 'g', amount: 200 })
    expect(itemMacros(r).kcal).toBe(260)
  })

  it('saves a new item per serving with its weight in the label', () => {
    const [egg] = buildItems({ name: 'M', items: [ai({})] }, [])
    expect(toFood(egg)).toMatchObject({ name: 'Egg', baseAmount: 100, unit: 'g', servingLabel: '1 egg, 50g', estimate: true, kcal: 150 })
  })

  it('treats the AI numbers as the whole eaten amount (300 ml milk stays ~180 kcal)', () => {
    const [milk] = buildItems({ name: 'M', items: [ai({ name: 'Milk', liquid: true, eatenGrams: 300, gramsPerServing: 0, servingLabel: '1 glass', kcal: 183, protein: 10, carbs: 14, fat: 10 })] }, [])
    expect(milk).toMatchObject({ unit: 'ml', amount: 300 })
    expect(itemMacros(milk).kcal).toBeCloseTo(183)
    expect(toFood(milk)).toMatchObject({ baseAmount: 100, unit: 'ml', servingLabel: '100 ml', kcal: 61 })
    const [noWeight] = buildItems({ name: 'M', items: [ai({ eatenGrams: 0 })] }, [])
    expect(noWeight).toMatchObject({ unit: 'serving', amount: 1, baseUnit: 'serving' })
    expect(itemMacros(noWeight).kcal).toBe(150)
  })
})
