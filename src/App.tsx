import { useEffect, useState } from 'react'
import { todayKey } from './logic/dates'
import { Today } from './screens/Today'
import { Week } from './screens/Week'
import { Foods } from './screens/Foods'
import { More } from './screens/More'

type Tab = 'today' | 'week' | 'foods' | 'more'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'foods', label: 'Foods' },
  { id: 'more', label: 'More' },
]

/** Keeps "today" correct if the app stays open past midnight or is resumed the next day. */
function useToday(): string {
  const [today, setToday] = useState(todayKey())
  useEffect(() => {
    const tick = () => setToday(todayKey())
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])
  return today
}

export default function App() {
  const today = useToday()
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDate] = useState(today)
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    // Day rolled over while the app was open: jump to the new day.
    setSeenToday(today)
    setDate(today)
  }

  return (
    <div className="app">
      <main>
        {tab === 'today' && <Today date={date} today={today} onDateChange={setDate} />}
        {tab === 'week' && <Week date={date} today={today} onDateChange={setDate} onOpenDay={(d) => { setDate(d); setTab('today') }} />}
        {tab === 'foods' && <Foods />}
        {tab === 'more' && <More today={today} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
    </div>
  )
}
