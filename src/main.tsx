import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { ensureSeeded } from './db/db'

// Ask the browser not to evict our data under storage pressure (granted for Home Screen apps on iOS).
navigator.storage?.persist?.().catch(() => {})

// Offline support: the service worker caches the app so it opens with no connection.
registerSW({ immediate: true })

const root = createRoot(document.getElementById('root')!)
ensureSeeded()
  .catch((err) => console.error('Seeding failed', err))
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
