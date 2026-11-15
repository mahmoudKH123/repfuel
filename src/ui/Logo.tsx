/** App mark: bold R over a dumbbell charged to 75%. The Home Screen icons in public/ use the same drawing.
 *  Colours come from CSS tokens, so it follows the light/dark theme. The lg-* class names let the launch intro animate each part. */
import { useEffect, useRef } from 'react'
import { afterIntro } from './introGate'

const R =
  'M352 180 H552 A120 120 0 0 1 552 420 L680 600 H570 L462 436 H448 V600 H352 Z M448 268 H544 A36 36 0 0 1 544 340 H448 Z'

const FULL = 328 // charge width when the cell is full (the icon shows 246 = 75%)
const ICON = 246
const MIN = 80 // narrowest charge that still reads as a rounded pill

/** Width of the charge for a fill of 0..1. */
const chargeWidth = (f: number) => (f <= 0 ? 0 : MIN + (FULL - MIN) * Math.min(1, f))

/** Living logo: when `charge` is given the bar shows that fill (0..1) and rolls to new values; `plates` false slides
 *  the plates off the bar. It starts at the icon's 75%, so after the launch intro lands it rolls from there to today. */
export function Logo({ size = 28, charge, plates = true }: { size?: number; charge?: number; plates?: boolean }) {
  const bar = useRef<SVGRectElement>(null)
  const shown = useRef(ICON)
  useEffect(() => {
    if (charge == null) return
    const to = chargeWidth(charge)
    let raf = 0, wait = 0
    const cancel = afterIntro(() => {
      const from = shown.current
      if (Math.abs(to - from) < 0.5) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      let t0 = 0
      const ms = reduce ? 0 : 900
      const tick = (now: number) => {
        if (!t0) t0 = now
        const p = ms ? Math.min(1, (now - t0) / ms) : 1
        const e = 1 - Math.pow(1 - p, 3)
        const w = from + (to - from) * e
        shown.current = w
        const el = bar.current
        if (el) { el.setAttribute('width', String(Math.max(0, w))); el.style.opacity = w < MIN * 0.5 ? String(w / (MIN * 0.5)) : '1' }
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      // On launch the intro's logo is still flying here (0.72 s): roll once it has landed, so the roll reads as its own moment.
      const landing = document.documentElement.dataset.intro === 'fly' ? 850 : 150
      wait = window.setTimeout(() => { raf = requestAnimationFrame(tick) }, landing)
    })
    return () => { cancel(); cancelAnimationFrame(raf); window.clearTimeout(wait) }
  }, [charge])

  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="rf-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-bg1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-bg2)' }} />
        </linearGradient>
        <linearGradient id="rf-ch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-ch1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-ch2)' }} />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="1012" height="1012" rx="226" fill="url(#rf-bg)" style={{ stroke: 'var(--logo-edge)' }} strokeWidth="12" />
      <path className="lg-r" pathLength={1} d={R} style={{ fill: 'var(--logo-r)' }} fillRule="evenodd" transform="translate(512 380) scale(1.02) translate(-516 -390)" />
      <g className={plates ? 'lg-plates' : 'lg-plates off'} style={{ fill: 'var(--logo-plate)' }}>
        <rect className="lg-p lg-p1 r" x="692" y="746" width="40" height="48" rx="8" />
        <rect className="lg-p lg-p2 r" x="732" y="670" width="56" height="200" rx="16" />
        <rect className="lg-p lg-p3 r" x="796" y="704" width="36" height="132" rx="14" />
        <rect className="lg-p lg-p1 l" x="292" y="746" width="40" height="48" rx="8" />
        <rect className="lg-p lg-p2 l" x="236" y="670" width="56" height="200" rx="16" />
        <rect className="lg-p lg-p3 l" x="192" y="704" width="36" height="132" rx="14" />
      </g>
      <rect className="lg-cell" x="332" y="714" width="360" height="112" rx="56" style={{ fill: 'var(--logo-cell)', stroke: 'var(--logo-plate)' }} strokeWidth="12" />
      <rect ref={bar} className="lg-charge" x="348" y="730" width={ICON} height="80" rx="40" fill="url(#rf-ch)" />
    </svg>
  )
}
