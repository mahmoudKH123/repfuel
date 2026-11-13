import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { todayKey } from './logic/dates'
import { Today } from './screens/Today'
import { Week } from './screens/Week'
import { Settings } from './screens/Settings'
import { AddFood } from './screens/AddFood'
import { Train } from './screens/Train'
import { Logo } from './ui/Logo'
import { useTheme } from './ui/theme'
import { IconPlus, IconSettings, IconToday, IconTrain, IconWeek } from './ui/icons'
import { useSettings } from './ui/hooks'

type Tab = 'today' | 'week' | 'train' | 'settings'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <IconToday /> },
  { id: 'week', label: 'Week', icon: <IconWeek /> },
  { id: 'train', label: 'Train', icon: <IconTrain /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings /> },
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
  const [theme, toggleTheme, themeMode, setThemeMode] = useTheme()
  const settings = useSettings()
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    // Day rolled over while the app was open: jump to the new day.
    setSeenToday(today)
    setDate(today)
  }

  const openAdd = () => {
    // Settings and Train have no food day on screen, so come back to Today after adding.
    if (tab === 'settings' || tab === 'train') setTab('today')
    setAdding(true)
  }

  if (adding) return <AddFood date={date} today={today} onClose={() => setAdding(false)} />

  return (
    <div className="app">
      <header className="appbar">
        <button className="logo-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          <Logo size={38} />
        </button>
        <div className="greet">
          <span>{greeting()}</span>
          <strong>{settings.name || 'Mahmoud'}</strong>
        </div>
      </header>
      <main key={tab} className="screen">
        {tab === 'today' && <Today date={date} today={today} onDateChange={setDate} />}
        {tab === 'week' && <Week date={date} today={today} onDateChange={setDate} onOpenDay={(d) => { setDate(d); setTab('today') }} />}
        {tab === 'train' && <Train today={today} />}
        {tab === 'settings' && (
          <Settings today={today} themeMode={themeMode} onThemeMode={setThemeMode} onOpenFoods={() => setAdding(true)} />
        )}
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
    </div>
  )
}
