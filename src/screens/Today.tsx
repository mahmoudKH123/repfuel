import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { copyDay, deleteEntry, setDayType, updateEntryAmount } from '../db/repo'
import { addDays, formatDay } from '../logic/dates'
import { defaultDayType } from '../logic/budget'
import { useSettings, useWeek } from '../ui/hooks'
import { fmtAmount } from '../ui/format'
import { KcalRing, MacroBar } from '../ui/Progress'

interface Props {
  date: string
  today: string
  onDateChange: (d: string) => void
}

const r1 = (v: number) => Math.round(v * 10) / 10
const k = (v: number) => Math.round(v).toLocaleString('en-US')

export function Today({ date, today, onDateChange }: Props) {
  const settings = useSettings()
  const week = useWeek(date, today)
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]) ?? []
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

  const training = day.type === 'training'
  const toggleType = () => setDayType(date, training ? 'rest' : 'training', defaultDayType(date, settings))

  const saveEdit = async (id: number) => {
    const v = Number(editAmount)
    if (v > 0) await updateEntryAmount(id, v)
    setEditing(null)
  }

  return (
    <section>
      <div className="daynav">
        <button className="icon-btn" onClick={() => onDateChange(addDays(date, -1))} aria-label="Previous day">‹</button>
        <div className="daynav-title">
          <h1>{date === today ? 'Today' : formatDay(date, { weekday: 'long' })}</h1>
          <span className="muted">{formatDay(date, { day: 'numeric', month: 'long' })}</span>
        </div>
        <button className="icon-btn" onClick={() => onDateChange(addDays(date, 1))} aria-label="Next day">›</button>
      </div>

      <div className="pillrow">
        <button className={`pill ${training ? 'pill-train' : 'pill-rest'}`} onClick={toggleType} aria-label={`${training ? 'Training' : 'Rest'} day, tap to switch`}>
          {training ? 'Training day' : 'Rest day'}
        </button>
        {date !== today && <button className="pill" onClick={() => onDateChange(today)}>Go to today</button>}
      </div>

      <div className="card hero">
        <KcalRing eaten={day.eaten.kcal} target={day.target.kcal} />
        <div className="bars">
          <MacroBar label="Protein" color="var(--protein)" eaten={day.eaten.protein} target={day.target.protein} />
          <MacroBar label="Carbs" color="var(--carbs)" eaten={day.eaten.carbs} target={day.target.carbs} />
          <MacroBar label="Fat" color="var(--fat)" eaten={day.eaten.fat} target={day.target.fat} />
        </div>
      </div>
      {day.fatOver > 0 && <p className="banner warn">Fat is {r1(day.fatOver)}g over today's target.</p>}

      <div className="card weekline">
        <div><span className="muted">Left this week</span><strong>{k(week.left.kcal)} kcal</strong></div>
        <div className="muted">{k(week.left.protein)}P · {k(week.left.carbs)}C · {k(week.left.fat)}F</div>
      </div>

      <div className="section-head">
        <h2>Logged</h2>
        <span className="muted">{k(day.eaten.kcal)} kcal</span>
      </div>
      {entries.length === 0 ? (
        <div className="card empty">
          <p className="muted">Nothing logged yet. Tap + to add food.</p>
          <button onClick={copyYesterday}>Copy {formatDay(yesterday)}</button>
        </div>
      ) : (
        <ul className="card list">
          {entries.map((e) => (
            <li key={e.id} className="entry">
              <div className="entry-main">
                <strong>{e.name}{e.estimate && <span className="tag">est.</span>}</strong>
                <div className="chips">
                  <span className="muted">{fmtAmount(e.amount, e.unit)}</span>
                  <span className="chip kcal">{k(e.kcal)}</span>
                  <span className="chip p">{r1(e.protein)}P</span>
                  <span className="chip c">{r1(e.carbs)}C</span>
                  <span className="chip f">{r1(e.fat)}F</span>
                </div>
              </div>
              {editing === e.id ? (
                <form onSubmit={(ev) => { ev.preventDefault(); saveEdit(e.id!) }} className="row edit">
                  <input type="number" inputMode="decimal" step="any" min="0" value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} autoFocus aria-label="Amount" />
                  <button type="submit" className="primary">Save</button>
                </form>
              ) : (
                <div className="row">
                  <button className="small" onClick={() => { setEditing(e.id!); setEditAmount(String(e.amount)) }}>Edit</button>
                  <button className="small danger" onClick={() => deleteEntry(e.id!)} aria-label={`Delete ${e.name}`}>✕</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && <button className="link" onClick={copyYesterday}>Same as yesterday</button>}
      {notice && <p className="muted" role="status">{notice}</p>}
    </section>
  )
}
