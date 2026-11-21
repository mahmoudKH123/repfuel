import { useEffect, useRef, type CSSProperties } from 'react'
import { Logo } from './Logo'

const BUILD_MS = 1600 // logo fully built; the flight starts here
const WORD = [...'Rep'].map((c) => ({ c, accent: false })).concat([...'Fuel'].map((c) => ({ c, accent: true })))
const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'

const FLY_MS = 950

/** Launch intro: the emerald light spreads out from the centre, the logo builds itself (tile springs in, R draws,
 *  plates slide onto the bar, the bar charges), the name rises in, then its dumbbell drops out and grows straight into
 *  Today's Fuel Bar (FuelBar) while the tile, left with just the R, quietly dissolves and the splash melts away. Once the
 *  dumbbell lands the page settles in. Tap anywhere to skip to the hand-off. */
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
      const bar = document.querySelector<SVGSVGElement>('.fb-bar')
      // The page renders after the database opens; on a slow first start wait for it (up to 1.5 s).
      if ((!bar || !document.querySelector('.td, .screen')) && waited < 1500) { later(() => leave(waited + 80), 80); return }
      leaving.current = true
      if (performance.now() - started.current < BUILD_MS) root.current?.classList.add('intro-skip')
      onRelease()

      const timing = (ms: number, delay = 0, easing = ease): KeyframeAnimationOptions => ({ duration: ms, delay, easing, fill: 'forwards' })
      word.current?.animate([{}, { opacity: 0, transform: 'translateY(-10px) scale(0.96)', filter: 'blur(6px)' }], timing(260, 0, 'ease-in'))
      bg.current?.animate([{}, { opacity: 0 }], timing(620, 160, 'ease'))

      const fly = flyX.current
      const handoff = bar && fly ? handDumbbell(tile.current, root.current, bar) : undefined
      if (fly && handoff) {
        // The dumbbell leaves the tile for the Fuel Bar; the tile, now just the R, lifts a touch and quietly dissolves.
        fly.animate([
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
          { opacity: 1, transform: 'translateY(-4px) scale(0.985)', filter: 'blur(0)', offset: 0.3 },
          { opacity: 0, transform: 'translateY(-18px) scale(0.9)', filter: 'blur(5px)' },
        ], { duration: 720, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' })
        handoff.move.onfinish = () => {
          // Landed: the page settles in around the bar, the real bar takes over (same shape, same spot) and the overlay goes.
          settlePage()
          onLand()
          requestAnimationFrame(() => onDone())
        }
        stop.current = handoff.cancel
      } else {
        const fade = fly?.animate([{}, { transform: 'scale(1.25)', opacity: 0 }], timing(450, 0, 'ease-in'))
        if (fade) fade.onfinish = () => { onLand(); onDone() }
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
 *  another: the macros, the water, the week, the log; the tab bar rises in from below.
 *  Opacity and transform only, so it runs on the graphics chip. */
function settlePage() {
  const blocks = [...document.querySelectorAll<HTMLElement>('.td-budget > .td-macros, .td .wt, .td .td-week, .td .td-loghead, .td .td-group')]
  const tabs = document.querySelector<HTMLElement>('.app > .tabs')
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  blocks.forEach((el, i) => el.animate([{ opacity: 0.16, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 60 + i * 70, easing: ease, fill: 'backwards' }))
  tabs?.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 120, easing: ease, fill: 'backwards' })
}

/** The logo's dumbbell leaves the tile: a copy of it drops out and grows, without turning, straight onto Today's Fuel
 *  Bar (drawn on the logo's own 640-wide grid, so it lands on the same shape), while the tile, left with just the R,
 *  fades away. Returns the move and a cancel function. */
function handDumbbell(tile: HTMLElement | null, layer: HTMLElement | null, dest: SVGSVGElement): { move: Animation; cancel: () => void } | undefined {
  const src = tile?.querySelector('svg')
  if (!src || !layer) return
  const a = src.getBoundingClientRect(), b = dest.getBoundingClientRect()
  if (!a.width || !b.width) return
  const ghost = src.cloneNode(true) as SVGSVGElement
  ghost.querySelectorAll('.lg-r, :scope > rect:first-of-type, :scope > defs + rect').forEach((el) => el.remove())
  // The copy sits inside the intro too: keep its parts as built, not replaying the build animation.
  ghost.querySelectorAll<SVGElement>('*').forEach((el) => { el.style.animation = 'none' })
  // Pivot on the dumbbell's centre: x 512, y 770 on the logo's 1024 grid (it spans x 192-832, y 670-870).
  const gu = a.width / 1024, ox = 512 * gu, oy = 770 * gu
  Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: '0', overflow: 'visible', pointerEvents: 'none', transformOrigin: `${ox}px ${oy}px`, willChange: 'transform' })
  layer.appendChild(ghost)
  const parts = [...src.querySelectorAll<SVGElement>('.lg-plates, .lg-cell, .lg-charge')]
  parts.forEach((el) => el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: FLY_MS, fill: 'forwards' }))
  // The bar's 640 x 220 grid takes the logo dumbbell's 640 x 200.
  const tu = b.width / 640, sx = tu / gu, sy = (220 * tu) / (200 * gu)
  const dx = b.left + b.width / 2 - (a.left + ox), dy = b.top + b.height / 2 - (a.top + oy)
  const move = ghost.animate([
    { transform: 'none' },
    { transform: `translate(${(dx * 0.12).toFixed(1)}px, ${(dy * 0.42).toFixed(1)}px) scale(${(1 + (sx - 1) * 0.3).toFixed(3)}, ${(1 + (sy - 1) * 0.3).toFixed(3)})`, offset: 0.4 },
    { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` },
  ], { duration: FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.1, 1)', fill: 'forwards' })
  return { move, cancel: () => { move.cancel(); ghost.remove() } }
}
