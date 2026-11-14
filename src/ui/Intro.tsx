import { useEffect, useRef, type CSSProperties } from 'react'
import { Logo } from './Logo'

const BUILD_MS = 1600 // logo fully built; the flight starts here
const WORD = [...'Rep'].map((c) => ({ c, accent: false })).concat([...'Fuel'].map((c) => ({ c, accent: true })))
const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Launch intro: the emerald light spreads out from the centre, the logo builds itself (tile springs in, R draws,
 *  plates slide onto the bar, the bar charges), the name rises in, then the logo flies into its place in the greeting
 *  while the page comes alive underneath. Tap anywhere to skip to the flight. */
export function Intro({ onRelease, onDone }: { onRelease: () => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const flyY = useRef<HTMLDivElement>(null)
  const flyX = useRef<HTMLDivElement>(null)
  const tile = useRef<HTMLDivElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const started = useRef(0)
  const leaving = useRef(false)

  useEffect(() => {
    started.current = performance.now()
    const timers: number[] = []
    const later = (f: () => void, ms: number) => timers.push(window.setTimeout(f, ms))

    const leave = (waited = 0) => {
      if (leaving.current) return
      const target = document.querySelector('.gr .logo-btn svg')?.getBoundingClientRect()
      // The page renders after the database opens; on a slow first start wait for the greeting logo (up to 1.5 s).
      if (!target && waited < 1500) { later(() => leave(waited + 80), 80); return }
      leaving.current = true
      if (performance.now() - started.current < BUILD_MS) root.current?.classList.add('intro-skip')
      onRelease()

      const timing = (ms: number, delay = 0, easing = ease): KeyframeAnimationOptions => ({ duration: ms, delay, easing, fill: 'forwards' })
      word.current?.animate([{}, { opacity: 0, transform: 'translateY(-10px) scale(0.96)', filter: 'blur(6px)' }], timing(260, 0, 'ease-in'))
      bg.current?.animate([{}, { opacity: 0 }], timing(520, 140, 'ease'))

      let flight: Animation | undefined
      const from = flyX.current?.getBoundingClientRect()
      if (target && from && target.width > 0) {
        const dx = target.left + target.width / 2 - (from.left + from.width / 2)
        const dy = target.top + target.height / 2 - (from.top + from.height / 2)
        const s = target.width / from.width
        // X and Y use different curves so the logo travels on a soft arc, not a straight line.
        flyY.current?.animate([{ transform: 'none' }, { transform: `translateY(${dy}px)` }], timing(720, 0, 'cubic-bezier(0.55, 0, 0.25, 1)'))
        flight = flyX.current?.animate([{ transform: 'none' }, { transform: `translateX(${dx}px) scale(${s})` }], timing(720, 0, ease))
        tile.current?.animate([{}, { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }], timing(720, 0, ease))
      } else {
        flight = flyX.current?.animate([{}, { transform: 'scale(1.25)', opacity: 0 }], timing(450, 0, 'ease-in'))
      }
      const end = () => onDone()
      if (flight) flight.onfinish = end
      else end()
    }

    later(() => leave(), BUILD_MS)
    later(onDone, 6000) // safety net: never leave the overlay up
    const skip = () => leave()
    const el = root.current
    el?.addEventListener('pointerdown', skip)
    return () => { timers.forEach((t) => window.clearTimeout(t)); el?.removeEventListener('pointerdown', skip) }
  }, [onRelease, onDone])

  return (
    <div className="intro" ref={root} aria-hidden="true">
      <div className="intro-bg" ref={bg}>
        <i className="ib ib1" /><i className="ib ib2" /><i className="ib ib3" />
      </div>
      <div className="intro-stage">
        <div ref={flyY}>
          <div className="intro-fly" ref={flyX}>
            <span className="intro-burst" />
            <div className="intro-tile" ref={tile}>
              <Logo size={120} />
              <span className="intro-shine" />
              <span className="intro-sheen" />
            </div>
          </div>
        </div>
        <div className="intro-word" ref={word}>
          {WORD.map((l, i) => <span key={i} className={l.accent ? 'a' : undefined} style={{ '--i': i } as CSSProperties}>{l.c}</span>)}
        </div>
      </div>
    </div>
  )
}
