import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { todayKey } from './logic/dates'
import { Today } from './screens/Today'
import { Week } from './screens/Week'
import { Foods } from './screens/Foods'
import { More } from './screens/More'
import { AddFood } from './screens/AddFood'
import { Logo } from './ui/Logo'
import { IconFoods, IconMore, IconPlus, IconToday, IconWeek } from './ui/icons'

type Tab = 'today' | 'week' | 'foods' | 'more'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <IconToday /> },
  { id: 'week', label: 'Week', icon: <IconWeek /> },
  { id: 'foods', label: 'Foods', icon: <IconFoods /> },
  { id: 'more', label: 'More', icon: <IconMore /> },
]

function greeting(h = new Date().getHours()): string {
  if (h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

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
  const [adding, setAdding] = useState(false)
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    // Day rolled over while the app was open: jump to the new day.
    setSeenToday(today)
    setDate(today)
  }

  const openAdd = () => {
    // Foods and More have no day on screen, so show Today behind the sheet.
    if (tab === 'foods' || tab === 'more') setTab('today')
    setAdding(true)
  }

  return (
    <div className="app">
      <header className="appbar">
        <Logo size={38} />
        <div className="greet">
          <span>{greeting()}</span>
          <strong>Mahmoud</strong>
        </div>
      </header>
      <main key={tab} className="screen">
        {tab === 'today' && <Today date={date} today={today} onDateChange={setDate} />}
        {tab === 'week' && <Week date={date} today={today} onDateChange={setDate} onOpenDay={(d) => { setDate(d); setTab('today') }} />}
        {tab === 'foods' && <Foods />}
        {tab === 'more' && <More today={today} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t, i) => (
          <Fragment key={t.id}>
            {i === 2 && (
              <button className="tab-add" onClick={openAdd} aria-label="Add food"><span><IconPlus /></span></button>
            )}
            <button aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          </Fragment>
        ))}
      </nav>
      {adding && <AddFood date={date} onClose={() => setAdding(false)} />}
    </div>
  )
}
