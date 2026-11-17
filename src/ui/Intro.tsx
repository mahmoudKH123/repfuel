import { useEffect, useRef, type CSSProperties } from 'react'
import { Logo } from './Logo'

const BUILD_MS = 1600 // logo fully built; the flight starts here
const WORD = [...'Rep'].map((c) => ({ c, accent: false })).concat([...'Fuel'].map((c) => ({ c, accent: true })))
const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'

const FLY_MS = 950

/** Launch intro: the emerald light spreads out from the centre, the logo builds itself (tile springs in, R draws,
 *  plates slide onto the bar, the bar charges), the name rises in, then the same logo shrinks along one soft curve into
 *  the app mark beside your name (Greeting) while the splash melts away. Once it lands the page settles in and Today's
 *  figure draws itself. Tap anywhere to skip to the flight. */
export function Intro({ onRelease, onLand, onDone }: { onRelease: () => void; onLand: () => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const flyX = useRef<HTMLDivElement>(null)
  const tile = useRef<HTMLDivElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const started = useRef(0)
  const leaving = useRef(false)
  const stop = useRef<() => void>(() => {})

  useEffect(() => {
    started.current = performance.now()
    const timers: number[] = []
    const later = (f: () => void, ms: number) => timers.push(window.setTimeout(f, ms))

    const leave = (waited = 0) => {
      if (leaving.current) return
      const mark = document.querySelector<HTMLElement>('.gr-mark')
      // The page renders after the database opens; on a slow first start wait for it (up to 1.5 s).
      if ((!mark || !document.querySelector('.td, .screen')) && waited < 1500) { later(() => leave(waited + 80), 80); return }
      leaving.current = true
      if (performance.now() - started.current < BUILD_MS) root.current?.classList.add('intro-skip')
      onRelease()

      const timing = (ms: number, delay = 0, easing = ease): KeyframeAnimationOptions => ({ duration: ms, delay, easing, fill: 'forwards' })
      word.current?.animate([{}, { opacity: 0, transform: 'translateY(-10px) scale(0.96)', filter: 'blur(6px)' }], timing(260, 0, 'ease-in'))
      bg.current?.animate([{}, { opacity: 0 }], timing(620, 160, 'ease'))

      const fly = flyX.current
      if (mark && fly) {
        // One continuous move: it rises first, then slides across into the mark, shrinking all the way.
        const a = fly.getBoundingClientRect(), b = mark.getBoundingClientRect(), k = b.width / a.width
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2)
        const frames: Keyframe[] = []
        for (let i = 0; i <= 12; i++) {
          const s = i / 12, x = 2 * (1 - s) * s * dx * 0.1 + s * s * dx, y = 2 * (1 - s) * s * dy * 0.95 + s * s * dy
          frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + (k - 1) * (1 - Math.pow(1 - s, 1.6))).toFixed(4)})` })
        }
        const move = fly.animate(frames, { duration: FLY_MS, easing: 'cubic-bezier(0.45, 0, 0.15, 1)', fill: 'forwards' })
        move.onfinish = () => {
          // Landed: the page settles in, then the real mark takes over (same size, same spot) and the overlay goes.
          settlePage()
          onLand()
          requestAnimationFrame(() => { fly.style.visibility = 'hidden'; onDone() })
        }
        stop.current = () => move.cancel()
      } else {
        const fade = flyX.current?.animate([{}, { transform: 'scale(1.25)', opacity: 0 }], timing(450, 0, 'ease-in'))
        if (fade) fade.onfinish = () => onDone()
        else onDone()
      }
    }

    later(() => leave(), BUILD_MS)
    later(onDone, 9000) // safety net: never leave the overlay up
    const skip = () => leave()
    const el = root.current
    el?.addEventListener('pointerdown', skip)
    return () => { timers.forEach((t) => window.clearTimeout(t)); el?.removeEventListener('pointerdown', skip); stop.current() }
  }, [onRelease, onLand, onDone])

  return (
    <div className="intro" ref={root} aria-hidden="true">
      <div className="intro-bg" ref={bg}>
        <i className="ib ib1" /><i className="ib ib2" /><i className="ib ib3" />
      </div>
      <div className="intro-stage">
        <div className="intro-fly" ref={flyX}>
          <span className="intro-burst" />
          <div className="intro-tile" ref={tile}>
            <Logo size={120} />
            <span className="intro-shine" />
            <span className="intro-sheen" />
          </div>
        </div>
        <div className="intro-word" ref={word}>
          {WORD.map((l, i) => <span key={i} className={l.accent ? 'a' : undefined} style={{ '--i': i } as CSSProperties}>{l.c}</span>)}
        </div>
      </div>
    </div>
  )
}

/** After landing, what was held faint and low during the intro (see index.css) rises into place, one block after
 *  another: the calories, the macros, the water, the week, the log; the tab bar rises in from below.
 *  Opacity and transform only, so it runs on the graphics chip. */
function settlePage() {
  const blocks = [...document.querySelectorAll<HTMLElement>('.td-budget > .td-big, .td-budget > .td-cap, .td-budget > .td-macros, .td .wt, .td .td-week, .td .td-loghead, .td .td-group')]
  const tabs = document.querySelector<HTMLElement>('.app > .tabs')
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  blocks.forEach((el, i) => el.animate([{ opacity: 0.16, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 60 + i * 70, easing: ease, fill: 'backwards' }))
  tabs?.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 120, easing: ease, fill: 'backwards' })
}
