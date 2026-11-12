import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { archiveFood, saveFood } from '../db/repo'
import type { Food, FoodCategory, Unit } from '../db/types'
import { kcalFromMacros, kcalLooksWrong } from '../logic/macros'
import { fmtMacros, unitLabel } from '../ui/format'

const CATEGORIES: { value: FoodCategory; label: string }[] = [
  { value: 'branded', label: 'Branded' },
  { value: 'home', label: 'Home' },
  { value: 'combo', label: 'Meals' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'custom', label: 'Custom' },
]

export function Foods() {
  const foods = useLiveQuery(() => db.foods.where('archived').equals(0).sortBy('name'), []) ?? []
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<FoodCategory | 'all'>('all')
  const [editing, setEditing] = useState<Partial<Food> | null>(null)

  const q = query.trim().toLowerCase()
  const shown = foods.filter((f) => (cat === 'all' || f.category === cat) && (!q || f.name.toLowerCase().includes(q)))
  const review = foods.filter((f) => f.needsReview).length

  if (editing) return <FoodForm food={editing} onDone={() => setEditing(null)} />

  return (
    <section>
      <header className="row">
        <h1>My foods</h1>
        <button className="primary" onClick={() => setEditing({ category: 'custom', unit: 'serving', baseAmount: 1, estimate: false })}>New food</button>
      </header>
      <input type="search" placeholder="Search your foods" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search foods" />
      <div className="row wrap">
        <button aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All {foods.length}</button>
        {CATEGORIES.map((c) => (
          <button key={c.value} aria-pressed={cat === c.value} onClick={() => setCat(c.value)}>{c.label}</button>
        ))}
      </div>
      {review > 0 && <p className="warn">{review} food{review === 1 ? ' needs' : 's need'} a numbers check.</p>}
      <ul className="list">
        {shown.map((f) => (
          <li key={f.id}>
            <button className="item" onClick={() => setEditing(f)}>
              <strong>{f.name}{f.estimate && <span className="tag">estimate</span>}{f.needsReview && <span className="tag warn">check</span>}</strong>
              <span className="muted">{f.servingLabel ?? `${f.baseAmount} ${unitLabel(f.unit)}`} · {fmtMacros(f)}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="muted">No foods match. Add it with New food.</p>}
    </section>
  )
}

function FoodForm({ food, onDone }: { food: Partial<Food>; onDone: () => void }) {
  const [f, setF] = useState({
    name: food.name ?? '',
    category: food.category ?? 'custom',
    baseAmount: String(food.baseAmount ?? 1),
    unit: food.unit ?? 'serving',
    servingLabel: food.servingLabel ?? '',
    kcal: food.kcal != null ? String(food.kcal) : '',
    protein: food.protein != null ? String(food.protein) : '',
    carbs: food.carbs != null ? String(food.carbs) : '',
    fat: food.fat != null ? String(food.fat) : '',
    estimate: food.estimate ?? false,
    note: food.note ?? '',
  })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: string | boolean) => { setF({ ...f, [k]: v }); setError('') }

  const m = { kcal: Number(f.kcal), protein: Number(f.protein || 0), carbs: Number(f.carbs || 0), fat: Number(f.fat || 0) }
  const mismatch = f.kcal !== '' && kcalLooksWrong(m)

  const save = async () => {
    const base = Number(f.baseAmount)
    if (!f.name.trim()) return setError('Enter a name.')
    if (!(base > 0)) return setError('Enter a base amount above 0.')
    if (f.kcal === '' || [m.kcal, m.protein, m.carbs, m.fat].some((v) => !(v >= 0))) return setError('Enter calories, and macros as numbers of 0 or more.')
    await saveFood({
      ...(food as Food),
      name: f.name.trim(),
      category: f.category as FoodCategory,
      baseAmount: base,
      unit: f.unit as Unit,
      servingLabel: f.servingLabel.trim() || undefined,
      estimate: f.estimate,
      note: f.note.trim() || undefined,
      // Saving after a check clears the review flag.
      needsReview: false,
      ...m,
    })
    onDone()
  }

  const remove = async () => {
    if (food.id && window.confirm(`Delete ${food.name}? Past logs keep their numbers.`)) {
      await archiveFood(food.id)
      onDone()
    }
  }

  return (
    <section>
      <header className="row">
        <h1>{food.id ? 'Edit food' : 'New food'}</h1>
        <button onClick={onDone}>Cancel</button>
      </header>
      {food.needsReview && <p className="warn">{food.note ?? 'Check these numbers.'}</p>}
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <label>Name<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Group
          <select value={f.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <div className="grid2">
          <label>Numbers are per<input type="number" inputMode="decimal" step="any" min="0" value={f.baseAmount} onChange={(e) => set('baseAmount', e.target.value)} /></label>
          <label>Unit
            <select value={f.unit} onChange={(e) => set('unit', e.target.value)}>
              <option value="serving">servings</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="spray">sprays</option>
            </select>
          </label>
        </div>
        <label>Serving description (optional)<input value={f.servingLabel} onChange={(e) => set('servingLabel', e.target.value)} placeholder="180g cup" /></label>
        <div className="grid4">
          <label>kcal<input type="number" inputMode="decimal" step="any" min="0" value={f.kcal} onChange={(e) => set('kcal', e.target.value)} /></label>
          <label>Protein<input type="number" inputMode="decimal" step="any" min="0" value={f.protein} onChange={(e) => set('protein', e.target.value)} /></label>
          <label>Carbs<input type="number" inputMode="decimal" step="any" min="0" value={f.carbs} onChange={(e) => set('carbs', e.target.value)} /></label>
          <label>Fat<input type="number" inputMode="decimal" step="any" min="0" value={f.fat} onChange={(e) => set('fat', e.target.value)} /></label>
        </div>
        {mismatch && <p className="warn">These macros add up to about {Math.round(kcalFromMacros(m))} kcal. Check the calories.</p>}
        <label className="check"><input type="checkbox" checked={f.estimate} onChange={(e) => set('estimate', e.target.checked)} />Estimate (no label)</label>
        <label>Note (optional)<input value={f.note} onChange={(e) => set('note', e.target.value)} /></label>
        {error && <p className="warn">{error}</p>}
        <div className="row">
          {food.id && <button type="button" onClick={remove}>Delete food</button>}
          <button type="submit" className="primary">Save food</button>
        </div>
      </form>
    </section>
  )
}
