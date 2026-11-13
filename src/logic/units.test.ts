import { describe, expect, it } from 'vitest'
import { availableUnits, convert, gramsFromLabel, servingNoun, toBase, toStored, type UnitInfo } from './units'

const yogurt: UnitInfo = { base: 'serving', gramsPerServing: 170, liquid: false }
const juice100: UnitInfo = { base: 'ml', gramsPerServing: 250, liquid: true }

describe('units', () => {
  it('reads grams from serving labels', () => {
    expect(gramsFromLabel('1 scoop, 36g')).toEqual({ amount: 36, liquid: false })
    expect(gramsFromLabel('180g cup')).toEqual({ amount: 180, liquid: false })
    expect(gramsFromLabel('330 ml can')).toEqual({ amount: 330, liquid: true })
    expect(gramsFromLabel('200ml milk + 1 scoop')).toBeUndefined()
    expect(gramsFromLabel('1 cup')).toBeUndefined()
  })

  it('finds a friendly noun for servings', () => {
    expect(servingNoun('1 slice, 30g')).toBe('slice')
    expect(servingNoun('2 pieces')).toBe('piece')
    expect(servingNoun('1 medium plate')).toBe('plate')
    expect(servingNoun('')).toBe('serving')
  })

  it('offers units only when it can convert', () => {
    expect(availableUnits(yogurt)).toEqual(['serving', 'g'])
    expect(availableUnits({ base: 'serving', liquid: false })).toEqual(['serving'])
    expect(availableUnits(juice100)).toEqual(['serving', 'ml', 'l'])
    expect(availableUnits({ base: 'g', liquid: false })).toEqual(['g'])
  })

  it('converts between servings, grams and litres', () => {
    expect(convert(1, 'serving', 'g', yogurt)).toBe(170)
    expect(convert(85, 'g', 'serving', yogurt)).toBe(0.5)
    expect(toBase(340, 'g', yogurt)).toBe(2)
    expect(convert(500, 'ml', 'l', juice100)).toBe(0.5)
    expect(toBase(0.5, 'l', juice100)).toBe(500)
    expect(toBase(2, 'serving', juice100)).toBe(500)
  })

  it('stores litres as ml', () => {
    expect(toStored(1.5, 'l')).toEqual({ amount: 1500, unit: 'ml' })
    expect(toStored(2, 'serving')).toEqual({ amount: 2, unit: 'serving' })
  })
})
