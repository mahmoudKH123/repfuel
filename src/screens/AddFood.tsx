import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { logFood, logQuick, saveFood } from '../db/repo'
import type { Food } from '../db/types'
import { defaultAmount, scaleFood } from '../logic/macros'
import { fmtMacros, unitLabel } from '../ui/format'

interface Props {
  date: string
  onClose: () => void
}

export function AddFood({ date, onClose }: Props) {
  const foods = useLiveQuery(() => db.foods.where('archived').equals(0).sortBy('name'), []) ?? []
  // Most-logged foods float to the top when the search is empty.
  const recentIds = useLiveQuery(async () => {
    const counts = new Map<number, number>()
    for (const e of await db.entries.orderBy('createdAt').reverse().limit(300).toArray()) {
      if (e.foodId) counts.set(e.foodId, (counts.get(e.foodId) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, []) ?? []

  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [quick, setQuick] = useState(false)

  const results = (() => {
    const q = query.trim().toLowerCase()
    if (q) return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 40)
    const byId = new Map(foods.map((f) => [f.id!, f]))
    const recent = recentIds.map((id) => byId.get(id)).filter((f): f is Food => !!f).slice(0, 8)
    return recent.length ? recent : foods.slice(0, 40)
  })()

  const pick = (f: Food) => {
    setPicked(f)
    setAmount(String(defaultAmount(f)))
  }

  const amt = Number(amount)
  const add = async () => {
    if (!picked || !(amt > 0)) return
    await logFood(date, picked, amt)
    onClose()
  }

  if (quick) return <QuickAdd date={date} onClose={onClose} onBack={() => setQuick(false)} />

  return (
    <div className="sheet" role="dialog" aria-label="Add food">
      <div className="row">
        <h2>Add food</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {picked ? (
        <form onSubmit={(e) => { e.preventDefault(); add() }}>
          <p><strong>{picked.name}</strong>{picked.estimate && <span className="tag">estimate</span>}</p>
          <p className="muted">Per {picked.servingLabel ?? `${picked.baseAmount} ${unitLabel(picked.unit)}`}: {fmtMacros(picked)}</p>
          {picked.needsReview && <p className="warn">{picked.note ?? 'Check these numbers.'}</p>}
          <label>
            Amount ({unitLabel(picked.unit)})
            <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          {amount !== '' && !(amt > 0) && <p className="warn">Enter an amount above 0.</p>}
          <p>{fmtMacros(scaleFood(picked, amt))}</p>
          <div className="row">
            <button type="button" onClick={() => setPicked(null)}>Back</button>
            <button type="submit" className="primary">Add to log</button>
          </div>
        </form>
      ) : (
        <>
          <input type="search" placeholder="Search your foods" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Search foods" />
          {!query && recentIds.length > 0 && <p className="muted">Most logged</p>}
          <ul className="list">
            {results.map((f) => (
              <li key={f.id}>
                <button className="item" onClick={() => pick(f)}>
                  <strong>{f.name}</strong>
                  <span className="muted">{f.servingLabel ?? `${f.baseAmount} ${unitLabel(f.unit)}`} · {fmtMacros(f)}</span>
                </button>
              </li>
            ))}
          </ul>
          {query && results.length === 0 && <p className="muted">No saved food matches “{query}”. Use quick add to log it.</p>}
          <button onClick={() => setQuick(true)}>Quick add</button>
        </>
      )}
    </div>
  )
}

function QuickAdd({ date, onClose, onBack }: Props & { onBack: () => void }) {
  const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', estimate: true, save: false })
  const [error, setError] = useState('')
  const set = (k: keyof typeof form, v: string | boolean) => { setForm({ ...form, [k]: v }); setError('') }

  const submit = async () => {
    const m = { kcal: Number(form.kcal), protein: Number(form.protein || 0), carbs: Number(form.carbs || 0), fat: Number(form.fat || 0) }
    if (!form.name.trim()) return setError('Enter a name.')
    if (!(m.kcal >= 0) || form.kcal === '' || [m.protein, m.carbs, m.fat].some((v) => !(v >= 0))) return setError('Enter calories, and macros as numbers of 0 or more.')
    const name = form.name.trim()
    let foodId: number | undefined
    if (form.save) foodId = await saveFood({ name, category: 'custom', baseAmount: 1, unit: 'serving', estimate: form.estimate, ...m })
    await logQuick(date, { name, foodId, amount: 1, unit: 'serving', estimate: form.estimate, ...m })
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="Quick add">
      <div className="row">
        <h2>Quick add</h2>
        <button onClick={onBack}>Back</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label>Name<input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Grilled chicken wrap" autoFocus /></label>
        <div className="grid4">
          <label>kcal<input type="number" inputMode="decimal" step="any" min="0" value={form.kcal} onChange={(e) => set('kcal', e.target.value)} /></label>
          <label>Protein<input type="number" inputMode="decimal" step="any" min="0" value={form.protein} onChange={(e) => set('protein', e.target.value)} /></label>
          <label>Carbs<input type="number" inputMode="decimal" step="any" min="0" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} /></label>
          <label>Fat<input type="number" inputMode="decimal" step="any" min="0" value={form.fat} onChange={(e) => set('fat', e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.estimate} onChange={(e) => set('estimate', e.target.checked)} />Mark as estimate</label>
        <label className="check"><input type="checkbox" checked={form.save} onChange={(e) => set('save', e.target.checked)} />Save to my foods</label>
        {error && <p className="warn">{error}</p>}
        <button type="submit" className="primary">Add to log</button>
      </form>
    </div>
  )
}
