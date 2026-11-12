import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepFuelDB, ensureSeeded } from './db'
import { REMOVED_SEED_KEYS, SEED_FOODS } from './seedFoods'
import { exportBackup, parseBackup, restoreBackup } from './backup'

let n = 0
let database: RepFuelDB
beforeEach(() => {
  database = new RepFuelDB(`test-${n++}`)
})

describe('database', () => {
  it('seeds the food list and default settings once', async () => {
    await ensureSeeded(database)
    await ensureSeeded(database)
    expect(await database.foods.count()).toBe(SEED_FOODS.length)
    expect((await database.settings.get('settings'))?.value.targets.training.kcal).toBe(2400)
  })

  it('does not bring back an archived food', async () => {
    await ensureSeeded(database)
    const tuna = await database.foods.where('seedKey').equals('sunshine-tuna').first()
    await database.foods.update(tuna!.id!, { archived: 1 })
    await database.meta.put({ key: 'seedVersion', value: 0 })
    await ensureSeeded(database)
    expect(await database.foods.where('seedKey').equals('sunshine-tuna').count()).toBe(1)
  })

  it('hides removed built-in foods on existing installs, but keeps ones the user edited', async () => {
    const now = 1
    const old = (seedKey: string, updatedAt: number) => ({
      seedKey, name: seedKey, category: 'branded' as const, baseAmount: 1, unit: 'serving' as const,
      kcal: 1, protein: 1, carbs: 1, fat: 1, estimate: false, archived: 0 as const, createdAt: now, updatedAt,
    })
    // Simulate a phone that installed the v1 list, then the user fixed the pesto sandwich themselves.
    await database.foods.bulkAdd([old('reef-protein-bread', now), old('bf-pesto-chicken', 5)])
    await database.meta.put({ key: 'seedVersion', value: 1 })
    await ensureSeeded(database)
    expect((await database.foods.where('seedKey').equals('reef-protein-bread').first())?.archived).toBe(1)
    expect((await database.foods.where('seedKey').equals('bf-pesto-chicken').first())?.archived).toBe(0)
    expect(SEED_FOODS.some((s) => REMOVED_SEED_KEYS.includes(s.seedKey))).toBe(false)
  })

  it('round-trips a backup', async () => {
    await ensureSeeded(database)
    await database.entries.add({ date: '2026-11-12', name: 'Shake', amount: 1, unit: 'serving', estimate: false, createdAt: 1, kcal: 194, protein: 31, carbs: 14, fat: 2 })
    await database.weights.put({ date: '2026-11-12', kg: 74.6 })
    const json = JSON.stringify(await exportBackup(database))

    const other = new RepFuelDB(`test-${n++}`)
    await restoreBackup(parseBackup(json), other)
    expect(await other.entries.count()).toBe(1)
    expect(await other.foods.count()).toBe(SEED_FOODS.length)
    expect((await other.weights.get('2026-11-12'))?.kg).toBe(74.6)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/isn't a RepFuel backup/)
    expect(() => parseBackup('nope')).toThrow(/isn't a RepFuel backup/)
  })
})
