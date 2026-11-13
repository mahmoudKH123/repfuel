import { describe, expect, it } from 'vitest'
import { SEED_FOODS } from '../db/seedFoods'
import { searchByName } from './search'

const names = (q: string) => searchByName(SEED_FOODS, q).map((f) => f.name)

describe('food search', () => {
  it('matches words in any order and partial words', () => {
    expect(names('d toast')[0]).toBe('D protein toast')
    expect(names('toast d')[0]).toBe('D protein toast')
    expect(names('yog greek')).toEqual(expect.arrayContaining(['Juhayna Greek yogurt', 'Almarai Greek yogurt', 'Yopolis Greek yogurt, peach']))
    expect(names('choc shake')[0]).toBe('KeepGoing chocolate shake (milk)')
    expect(names('mahshi')[0]).toBe('Stuffed green peppers (mahshi)')
    expect(names('foul')[0]).toBe('Canned fava beans (foul)')
  })

  it('tolerates small typos', () => {
    expect(names('chiken batch')[0]).toBe('Chicken batch')
    expect(names('mozarella')[0]).toBe('Domty light mozzarella')
    expect(names('brwnie')[0]).toBe('ASN chocolate brownie')
    expect(names('ghee')).toEqual(['Ghee'])
  })

  it('ignores case and punctuation, and needs every word', () => {
    expect(names("MCDONALDS shake")[0]).toBe("McDonald's medium vanilla milkshake")
    expect(names('d toast xyz')).toEqual([])
    expect(names('')).toEqual([])
  })
})
