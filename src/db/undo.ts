import type Dexie from 'dexie'
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, Middleware } from 'dexie'

/**
 * Undo for every change in the app (one step: the last change).
 *
 * A database hook sees every write. While a user action runs inside `undoable()`, the hook remembers how each
 * touched row looked before (or that it didn't exist). Undo puts those rows back exactly, in one transaction,
 * so any screen showing them updates on its own. Changes outside the database (theme, AI passcode) register
 * their own way back with `recordUndo()`. Background writes (week set-up, auto-reshuffle) are never recorded.
 */

type Change = { dexie: Dexie; table: string; key: unknown; before: unknown }
type Recorder = { changes: Map<string, Change> }

export type UndoStep = { id: number; label: string; detail?: string }
export type UndoEvent = { kind: 'changed' | 'undone'; step: UndoStep } | null
type Stored = UndoStep & { changes: Change[]; revert?: () => void | Promise<void> }

const recorders: Recorder[] = []
let applying = false
let last: Stored | null = null
let event: UndoEvent = null
let seq = 0
const listeners = new Set<() => void>()

const emit = (e: UndoEvent) => { event = e; listeners.forEach((l) => l()) }

/** Same row content, ignoring the "last edited" stamp (re-saving unchanged values isn't a change). */
function same(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) => (v && typeof v === 'object' ? { ...(v as Record<string, unknown>), updatedAt: 0 } : v)
  try { return JSON.stringify(strip(a)) === JSON.stringify(strip(b)) } catch { return false }
}
const copy = <T,>(v: T): T => (v === undefined ? v : structuredClone(v))

function remember(dexie: Dexie, table: string, key: unknown, before: unknown) {
  const id = `${table}\u0000${JSON.stringify(key)}`
  for (const r of recorders) if (!r.changes.has(id)) r.changes.set(id, { dexie, table, key, before: copy(before) })
}

/** Database hook: records the "before" of every row a write touches, only while an undoable action runs. */
export function undoMiddleware(dexie: Dexie): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'undo',
    create(down) {
      return {
        ...down,
        table(name: string): DBCoreTable {
          const t = down.table(name)
          const pk = t.schema.primaryKey
          return {
            ...t,
            async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
              if (!recorders.length || applying) return t.mutate(req)
              if (req.type === 'deleteRange') {
                const found = await t.query({ trans: req.trans, values: true, query: { index: pk, range: req.range } })
                for (const v of found.result) remember(dexie, name, pk.extractKey?.(v), v)
                return t.mutate(req)
              }
              const keys: unknown[] = req.type === 'delete'
                ? req.keys
                : req.keys ?? req.values.map((v) => pk.extractKey?.(v))
              const known = keys.filter((k) => k !== undefined)
              const befores = known.length ? await t.getMany({ trans: req.trans, keys: known }) : []
              const res = await t.mutate(req)
              let j = 0
              keys.forEach((k, i) => {
                const isNew = k === undefined
                const before = isNew ? undefined : befores[j++]
                const key = isNew ? res.results?.[i] : k
                if (key === undefined || res.failures?.[i]) return
                if (req.type === 'delete') { if (before !== undefined) remember(dexie, name, key, before); return }
                if (before !== undefined && same(before, req.values[i])) return
                remember(dexie, name, key, before)
              })
              return res
            },
          }
        },
      }
    },
  }
}

/**
 * Runs a user action and makes it the undo step. `label` says what happened (shown in the pill); give a
 * function to build it from the result, returning null to skip. Nothing is recorded if no row really changed.
 * `onUndo` runs after the rows are put back (e.g. stop a rest timer the action started).
 */
export async function undoable<T>(
  label: string | ((result: T) => string | null),
  fn: () => Promise<T>,
  opts: { detail?: string | ((result: T) => string | undefined); onUndo?: () => void } = {},
): Promise<T> {
  const rec: Recorder = { changes: new Map() }
  recorders.push(rec)
  let result: T
  try {
    result = await fn()
  } finally {
    recorders.splice(recorders.indexOf(rec), 1)
  }
  const text = typeof label === 'function' ? label(result) : label
  if (text && rec.changes.size) {
    const detail = typeof opts.detail === 'function' ? opts.detail(result) : opts.detail
    last = { id: ++seq, label: text, detail, changes: [...rec.changes.values()], revert: opts.onUndo }
    emit({ kind: 'changed', step: { id: last.id, label: text, detail } })
  }
  return result
}

/** A change outside the database (theme, passcode): store how to put it back. */
export function recordUndo(label: string, revert: () => void | Promise<void>) {
  last = { id: ++seq, label, changes: [], revert }
  emit({ kind: 'changed', step: { id: last.id, label } })
}

/** Puts the last change back. Returns false if there was nothing to undo. */
export async function undoLast(): Promise<boolean> {
  const s = last
  if (!s || applying) return false
  last = null
  applying = true
  try {
    const byDb = new Map<Dexie, Change[]>()
    for (const c of s.changes) byDb.set(c.dexie, [...(byDb.get(c.dexie) ?? []), c])
    for (const [dexie, changes] of byDb) {
      const tables = [...new Set(changes.map((c) => c.table))].map((n) => dexie.table(n))
      await dexie.transaction('rw', tables, async () => {
        for (const c of changes) {
          const t = dexie.table(c.table)
          if (c.before === undefined) await t.delete(c.key as never)
          else await t.put(copy(c.before))
        }
      })
    }
    await s.revert?.()
  } finally {
    applying = false
  }
  emit({ kind: 'undone', step: { id: s.id, label: s.label } })
  return true
}

/** Forget the step (e.g. tests, or after a full data restore elsewhere). */
export function clearUndo() {
  last = null
  emit(null)
}

export const canUndo = () => last !== null
export const undoEvent = () => event
export function subscribeUndo(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
