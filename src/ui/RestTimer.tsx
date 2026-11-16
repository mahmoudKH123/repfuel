import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtClock, restLeft } from '../logic/train'
import { haptic } from './haptic'

export type Rest = { endsAt: number; total: number; next: string }

const KEY = 'rf-rest'

/** The running rest survives tab switches, reloads and a locked screen (it's just an end time). */
export function loadRest(): Rest | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Rest | null
    return r && r.endsAt > Date.now() - 30_000 ? r : null
  } catch { return null }
}
export function storeRest(r: Rest | null) {
  try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY) } catch { /* private mode */ }
}

/**
 * Bar pinned above the tabs while resting: countdown, draining line, −15 / +15 / Skip.
 * At zero it turns into a silent full-screen "Go" (flash + haptic where the phone allows).
 */
export function RestTimer({ rest, onChange, onEnd }: { rest: Rest; onChange: (r: Rest) => void; onEnd: () => void }) {
  const [now, setNow] = useState(Date.now())
  const left = restLeft(rest.endsAt, now)
  const over = left === 0

  useEffect(() => {
    if (over) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    const wake = () => setNow(Date.now())
    document.addEventListener('visibilitychange', wake)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', wake) }
  }, [over])

  // Rest over: one haptic, then the Go screen clears itself after a few seconds.
  useEffect(() => {
    if (!over) return
    haptic(200)
    const id = window.setTimeout(onEnd, 6000)
    return () => window.clearTimeout(id)
  }, [over, onEnd])

  const add = (s: number) => {
    haptic()
    const endsAt = Math.max(Date.now() + 5000, rest.endsAt + s * 1000)
    onChange({ ...rest, endsAt, total: Math.max(rest.total, Math.ceil((endsAt - Date.now()) / 1000)) })
  }

  if (over) {
    return createPortal(
      <button className="rt-go" onClick={() => { haptic(); onEnd() }} aria-live="assertive">
        <span className="rt-go-word">Go</span>
        <span className="rt-go-next">{rest.next}</span>
        <span className="rt-go-hint">Tap to close</span>
      </button>,
      document.body,
    )
  }

  const share = rest.total > 0 ? left / rest.total : 0
  return createPortal(
    <div className="rt" role="timer" aria-label={`Rest ${fmtClock(left)} left`}>
      <div className="rt-line" aria-hidden><i style={{ transform: `scaleX(${share})` }} /></div>
      <div className="rt-row">
        <div className="rt-text">
          <small>Rest</small>
          <b key={left > 10 ? 'n' : left} className={left <= 10 ? 'soon' : ''}>{fmtClock(left)}</b>
        </div>
        <span className="rt-next">Next: {rest.next}</span>
        <div className="rt-btns">
          <button onClick={() => add(-15)} aria-label="15 seconds less">−15</button>
          <button onClick={() => add(15)} aria-label="15 seconds more">+15</button>
          <button className="rt-skip" onClick={() => { haptic(); onEnd() }}>Skip</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
