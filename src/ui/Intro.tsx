import { useEffect, useRef, type CSSProperties } from 'react'
import { Logo } from './Logo'
import { morphLogoToBar } from './morph'

const BUILD_MS = 1600 // logo fully built; the flight starts here
const WORD = [...'Rep'].map((c) => ({ c, accent: false })).concat([...'Fuel'].map((c) => ({ c, accent: true })))
const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Launch intro: the emerald light spreads out from the centre, the logo builds itself (tile springs in, R draws,
 *  plates slide onto the bar, the bar charges), the name rises in, then the little dumbbell in the logo morphs into
 *  Today's big barbell (ui/morph.ts) while the page comes alive underneath. Tap anywhere to skip to the morph. */
export function Intro({ onRelease, onLand, onDone }: { onRelease: () => void; onLand: () => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const flyX = useRef<HTMLDivElement>(null)
  const tile = useRef<HTMLDivElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const started = useRef(0)
  const leaving = useRef(false)
  const layer = useRef<HTMLDivElement>(null)
  const stop = useRef<() => void>(() => {})

  useEffect(() => {
    started.current = performance.now()
    const timers: number[] = []
    const later = (f: () => void, ms: number) => timers.push(window.setTimeout(f, ms))

    const leave = (waited = 0) => {
      if (leaving.current) return
      const bar = document.querySelector<SVGSVGElement>('.bb svg')
      // The page renders after the database opens; on a slow first start wait for the barbell (up to 1.5 s).
      if (!bar && waited < 1500) { later(() => leave(waited + 80), 80); return }
      leaving.current = true
      if (performance.now() - started.current < BUILD_MS) root.current?.classList.add('intro-skip')
      onRelease()

      const timing = (ms: number, delay = 0, easing = ease): KeyframeAnimationOptions => ({ duration: ms, delay, easing, fill: 'forwards' })
      word.current?.animate([{}, { opacity: 0, transform: 'translateY(-10px) scale(0.96)', filter: 'blur(6px)' }], timing(260, 0, 'ease-in'))
      bg.current?.animate([{}, { opacity: 0 }], timing(620, 160, 'ease'))

      if (bar && tile.current && layer.current) {
        // The little dumbbell in the logo becomes Today's barbell (ui/morph.ts).
        stop.current = morphLogoToBar({ tile: tile.current, bar, layer: layer.current, onLand, onDone })
      } else {
        const fade = flyX.current?.animate([{}, { transform: 'scale(1.25)', opacity: 0 }], timing(450, 0, 'ease-in'))
        if (fade) fade.onfinish = () => onDone()
        else onDone()
      }
    }

    later(() => leave(), BUILD_MS)
    later(onDone, 6000) // safety net: never leave the overlay up
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
      <div className="intro-layer" ref={layer} />
    </div>
  )
}
