import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { subscribeUndo, undoEvent, undoLast } from '../db/undo'
import { haptic } from './haptic'

const OPEN_MS = 6000 // pill with the label and the draining ring
const DOCK_MS = 60000 // then a small round button, until a minute after the change
const DONE_MS = 1800 // "Undone" confirmation

type Mode = 'hidden' | 'open' | 'dock' | 'done'

/**
 * The one undo for the whole app. After any change a pill rises above the tabs with what changed and a ring
 * that drains; then it tucks into a round button in the corner. Tap either to put the change back.
 */
export function UndoPill() {
  const ev = useSyncExternalStore(subscribeUndo, undoEvent)
  const [mode, setMode] = useState<Mode>('hidden')
  const [spin, setSpin] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (!ev) { setMode('hidden'); return }
    if (ev.kind === 'undone') {
      setMode('done')
      const t = window.setTimeout(() => setMode('hidden'), DONE_MS)
      return () => window.clearTimeout(t)
    }
    setMode('open')
    const a = window.setTimeout(() => setMode('dock'), OPEN_MS)
    const b = window.setTimeout(() => setMode('hidden'), DOCK_MS)
    return () => { window.clearTimeout(a); window.clearTimeout(b) }
  }, [ev])

  const undo = async () => {
    if (busy.current) return
    busy.current = true
    haptic()
    setSpin(true)
    try { await undoLast() } finally {
      busy.current = false
      window.setTimeout(() => setSpin(false), 500)
    }
  }

  if (!ev || mode === 'hidden') return null
  const icon = (
    <svg className={`ud-icon${spin ? ' spin' : ''}`} width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )

  return createPortal(
    <>
      {mode === 'open' && (
        <button key={ev.step.id} type="button" className="ud-pill" onClick={undo} aria-label={`Undo: ${ev.step.label}`}>
          <span className="ud-ring" aria-hidden>
            <svg className="ud-ring-svg" width="34" height="34" viewBox="0 0 34 34">
              <circle className="ud-track" cx="17" cy="17" r="15" />
              <circle className="ud-left" cx="17" cy="17" r="15" style={{ animationDuration: `${OPEN_MS}ms` }} />
            </svg>
            {icon}
          </span>
          <span className="ud-text">
            <b>{ev.step.label}</b>
            {ev.step.detail && <small>{ev.step.detail}</small>}
          </span>
          <span className="ud-go">Undo</span>
        </button>
      )}
      {mode === 'dock' && (
        <button key={`d${ev.step.id}`} type="button" className="ud-dock" onClick={undo} aria-label={`Undo: ${ev.step.label}`}>
          {icon}
        </button>
      )}
      {mode === 'done' && (
        <div key={`u${ev.step.id}`} className="ud-pill ud-done" role="status">
          <span className="ud-ring" aria-hidden>
            <svg className="ud-check" width="18" height="18" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <span className="ud-text"><b>Undone</b><small>{ev.step.label}</small></span>
        </div>
      )}
      <span className="visually-hidden" aria-live="polite">{mode === 'done' ? `Undone: ${ev.step.label}` : mode === 'open' ? `${ev.step.label}. Undo available.` : ''}</span>
    </>,
    document.body,
  )
}
