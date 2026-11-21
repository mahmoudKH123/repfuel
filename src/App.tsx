import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { todayKey } from './logic/dates'
import { Today } from './screens/Today'
import { Week } from './screens/Week'
import { Settings } from './screens/Settings'
import { AddFood } from './screens/AddFood'
import { Train } from './screens/Train'
import { Greeting } from './ui/Greeting'
import { useTheme, type ThemeMode } from './ui/theme'
import { UndoPill } from './ui/UndoPill'
import { recordUndo } from './db/undo'
import { IconPlus, IconSettings, IconToday, IconTrain, IconWeek } from './ui/icons'
import { useSettings } from './ui/hooks'

type Tab = 'today' | 'week' | 'train' | 'settings'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <IconToday /> },
  { id: 'week', label: 'Week', icon: <IconWeek /> },
  { id: 'train', label: 'Train', icon: <IconTrain /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings /> },
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
  const [adding, setAdding] = useState(false)
  const [addTabs, setAddTabs] = useState(false)
  const [themeMode, setThemeMode] = useTheme()
  const settings = useSettings()
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    // Day rolled over while the app was open: jump to the new day.
    setSeenToday(today)
    setDate(today)
  }

  const openAdd = () => {
    // Only Today shows which day you're on, so from any other tab food always goes to today.
    if (tab !== 'today') setDate(today)
    // Settings and Train have no food day on screen, so come back to Today after adding.
    if (tab === 'settings' || tab === 'train') setTab('today')
    setAdding(true)
  }

  // Look changes live outside the database, so they register their own undo.
  const MODE_NAME: Record<ThemeMode, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }
  const changeTheme = (m: ThemeMode) => {
    const prev = themeMode
    if (m === prev) return
    setThemeMode(m)
    recordUndo(`Look: ${MODE_NAME[prev]} → ${MODE_NAME[m]}`, () => setThemeMode(prev))
  }

  // Each tab has its own colour world (see index.css); on <html> so sheets and panels follow too.
  useEffect(() => { document.documentElement.dataset.world = adding ? 'add' : tab }, [adding, tab])

  // The tab bar. On Add food's list it stays up with the bubble behind the + (you're adding); a tab takes you there.
  const go = (t: Tab) => { setAdding(false); setTab(t) }
  const tabBar = (
    <>
      <div className="tabs-edge" aria-hidden="true" />
      <nav className="tabs" aria-label="Sections" style={{ '--slot': adding ? 2 : [0, 1, 3, 4][TABS.findIndex((t) => t.id === tab)] ?? 0 } as CSSProperties}>
        <span className="tab-bubble" aria-hidden="true" />
        {TABS.map((t, i) => (
          <Fragment key={t.id}>
            {i === 2 && (
              <button className="tab-add" onClick={adding ? undefined : openAdd} aria-label="Add food" aria-current={adding ? 'page' : undefined}><span key={adding ? 'add' : tab}><IconPlus /></span></button>
            )}
            <button aria-current={!adding && tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          </Fragment>
        ))}
      </nav>
    </>
  )

  // The undo pill stays mounted in the same place whichever view is showing.
  if (adding) return <><><div className="aurora" aria-hidden="true" /><div className="app"><AddFood date={date} today={today} onClose={() => setAdding(false)} onTabs={setAddTabs} />{addTabs && tabBar}</div><div className="aurora aurora-cover" aria-hidden="true" /></><UndoPill /></>

  return (
    <><div className="app">
      <div className="aurora" aria-hidden="true" />
      <header className="appbar">
        <Greeting today={today} name={settings.name || 'Mahmoud'} />
      </header>
      <main key={tab} className="screen">
        {tab === 'today' && <Today date={date} today={today} onDateChange={setDate} onAdd={openAdd} />}
        {tab === 'week' && <Week date={date} today={today} onDateChange={setDate} onOpenDay={(d) => { setDate(d); setTab('today') }} />}
        {tab === 'train' && <Train today={today} />}
        {tab === 'settings' && (
          <Settings today={today} themeMode={themeMode} onThemeMode={changeTheme} onOpenFoods={() => { setDate(today); setAdding(true) }} />
        )}
      </main>
      <div className="aurora aurora-cover" aria-hidden="true" />
      {tabBar}
    </div><UndoPill /></>
  )
}
