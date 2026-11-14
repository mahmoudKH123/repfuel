import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { mountIntro } from './ui/introGate'
import { ensureSeeded } from './db/db'
import { ensureWeek, syncRestDays } from './db/repo'
import { todayKey } from './logic/dates'
import { mondayOf } from './logic/schedule'

// Ask the browser not to evict our data under storage pressure (granted for Home Screen apps on iOS).
navigator.storage?.persist?.().catch(() => {})

// Home Screen app (iOS): mark it so the layout keeps content out of the band iOS blurs under the clock (see --band and .aurora-cover in index.css).
const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
if (standalone) document.documentElement.dataset.standalone = ''

// Cold start only: this file runs once per launch, so the intro plays after the app was fully closed, not when it comes back from the background.
mountIntro()

// Rows and buttons look pressed only for a real tap: once the finger moves (a scroll), the pressed look is dropped, like iOS lists.
{
  let x0 = 0, y0 = 0
  const root = document.documentElement
  addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; root.classList.remove('scrolling') }, { passive: true })
  addEventListener('touchmove', (e) => {
    const t = e.touches[0]
    if (Math.abs(t.clientX - x0) > 6 || Math.abs(t.clientY - y0) > 6) root.classList.add('scrolling')
  }, { passive: true })
  addEventListener('touchend', () => root.classList.remove('scrolling'), { passive: true })
}

// Offline support: the service worker caches the app so it opens with no connection.
registerSW({ immediate: true })

const root = createRoot(document.getElementById('root')!)
ensureSeeded()
  // Food rest days follow the training plan, then this week's schedule is created so Today's training/rest day follows it.
  .then(() => syncRestDays(todayKey()))
  .then(() => ensureWeek(mondayOf(todayKey()), todayKey()))
  .catch((err) => console.error('Seeding failed', err))
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
