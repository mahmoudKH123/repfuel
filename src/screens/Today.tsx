import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { copyDay, deleteEntry, setDayType, updateEntryAmount } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { fmtAmount, fmtMacros } from '../ui/format'
import { AddFood } from './AddFood'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
}

export function Today({ date, today, onDateChange }: Props) {
  const settings = useSettings()
  const week = useWeek(date, today)
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]) ?? []
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [notice, setNotice] = useState('')

  const day = week?.days.find((d) => d.date === date)
  if (!week || !day) return null

  const yesterday = addDays(date, -1)
  const copyYesterday = async () => {
    const count = await copyDay(yesterday, date)
    setNotice(count ? `Copied ${count} item${count === 1 ? '' : 's'} from ${formatDay(yesterday)}` : `Nothing logged on ${formatDay(yesterday)}`)
  }

  const toggleType = () =>
    setDayType(date, day.type === 'training' ? 'rest' : 'training', defaultDayType(date, settings))

  const saveEdit = async (id: number) => {
    const v = Number(editAmount)
    if (v > 0) await updateEntryAmount(id, v)
    setEditing(null)
  }

  return (
    <section>
      <header className="row">
        <button onClick={() => onDateChange(addDays(date, -1))} aria-label="Previous day">‹</button>
        <h1>{date === today ? 'Today' : formatDay(date)}</h1>
        <button onClick={() => onDateChange(addDays(date, 1))} aria-label="Next day">›</button>
      </header>
      {date !== today && <button className="link" onClick={() => onDateChange(today)}>Go to today</button>}

      <p>
        {formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
        <button onClick={toggleType}>{day.type === 'training' ? 'Training day' : 'Rest day'}</button>
      </p>

      <dl className="stats">
        <dt>Target</dt><dd>{fmtMacros(day.target)}</dd>
        <dt>Eaten</dt><dd>{fmtMacros(day.eaten)}</dd>
        <dt>Left today</dt><dd>{fmtMacros(day.left)}</dd>
        <dt>Left this week</dt><dd>{fmtMacros(week.left)}</dd>
      </dl>
      {day.fatOver > 0 && <p className="warn">Fat is {Math.round(day.fatOver * 10) / 10}g over today's target.</p>}

      <h2>Logged</h2>
      {entries.length === 0 ? (
        <p className="muted">Log your first item, or copy {formatDay(yesterday)}.</p>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.id}>
              <div>
                <strong>{e.name}</strong>{e.estimate && <span className="tag">estimate</span>}
                <div className="muted">{fmtAmount(e.amount, e.unit)} · {fmtMacros(e)}</div>
              </div>
              {editing === e.id ? (
                <form onSubmit={(ev) => { ev.preventDefault(); saveEdit(e.id!) }} className="row">
                  <input type="number" inputMode="decimal" step="any" min="0" value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} autoFocus aria-label="Amount" />
                  <button type="submit">Save</button>
                </form>
              ) : (
                <div className="row">
                  <button onClick={() => { setEditing(e.id!); setEditAmount(String(e.amount)) }}>Edit</button>
                  <button onClick={() => deleteEntry(e.id!)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <button className="primary" onClick={() => setAdding(true)}>Add food</button>
        <button onClick={copyYesterday}>Same as yesterday</button>
      </div>
      {notice && <p className="muted" role="status">{notice}</p>}

      {adding && <AddFood date={date} onClose={() => setAdding(false)} />}
    </section>
  )
}
