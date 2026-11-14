import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { ensureSeeded } from './db/db'
import { ensureWeek } from './db/repo'
import { todayKey } from './logic/dates'
import { mondayOf } from './logic/schedule'

// Ask the browser not to evict our data under storage pressure (granted for Home Screen apps on iOS).
navigator.storage?.persist?.().catch(() => {})

// Home Screen app (iOS): mark it so the layout keeps content out of the band iOS blurs under the clock (see --band and .aurora-cover in index.css).
const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
if (standalone) document.documentElement.dataset.standalone = ''

// Offline support: the service worker caches the app so it opens with no connection.
registerSW({ immediate: true })

const root = createRoot(document.getElementById('root')!)
ensureSeeded()
  // Create this week's training schedule early so Today's training/rest day follows it.
  .then(() => ensureWeek(mondayOf(todayKey()), todayKey()))
  .catch((err) => console.error('Seeding failed', err))
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
