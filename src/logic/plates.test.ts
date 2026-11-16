import { describe, expect, it } from 'vitest'
import { PLATES, loadPlates, plateTotal } from './plates'

describe('plates on the bar', () => {
  it('splits a weight into plates, heaviest first', () => {
    expect(loadPlates(55, PLATES.kg)).toEqual({ plates: [20, 20, 10, 5], rest: 0 })
    expect(loadPlates(62.5, PLATES.kg)).toEqual({ plates: [20, 20, 20, 2.5], rest: 0 })
    expect(loadPlates(135, PLATES.lbs)).toEqual({ plates: [45, 45, 45], rest: 0 })
  })
  it('keeps what plates cannot make as a leftover', () => {
    expect(loadPlates(33, PLATES.kg)).toEqual({ plates: [20, 10, 2.5], rest: 0.5 })
    expect(loadPlates(0, PLATES.kg)).toEqual({ plates: [], rest: 0 })
  })
  it('caps the plates drawn and moves the rest into the leftover', () => {
    const r = loadPlates(999, PLATES.kg)
    expect(r.plates.length).toBe(40)
    expect(plateTotal(r.plates, r.rest)).toBe(999)
  })
  it('adds plates and leftover without float drift', () => {
    expect(plateTotal([20, 2.5, 2.5, 2.5], 0.5)).toBe(28)
    expect(plateTotal([], 0)).toBe(0)
  })
})
