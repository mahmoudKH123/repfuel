import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { afterIntro, introRunning } from './introGate'
import { useCountUp } from './motion'
import { hot } from './heat'

/* Today's hero object: the logo's dumbbell, wide. The cell is today's fuel: what you've eaten flows in from the left as
   a liquid with a moving edge (the digits inside fill with it), heating to yellow, orange and red when you go over.
   The plates are today's lifts, loaded the way you load a bar (left, right, left, right, from the inside out), and
   clunk into amber as each is done. Drawn on the logo's own grid (640 wide), so the launch intro's dumbbell grows
   straight into it (Intro.tsx). */

export interface Lift { id: string; done: boolean }

const VB_W = 640, VB_H = 220, CY = 110
const CELL = { x: 140, y: 35, w: 360, h: 150 }
const IN = { x: 154, y: 49, w: 332, h: 122 }
const COLLAR = { w: 40, h: 56 }
// Plate thickness and height going outward from the collar (the first two are the logo's plates). A side is never
// longer than the logo's (100): with more lifts the plates get thinner, like real ones.
const THICK = [56, 36, 30, 26, 22, 20], TALL = [220, 150, 128, 112, 100, 90], SIDE = 100
const MAX = THICK.length * 2
const REST: Lift[] = [0, 1, 2, 3].map((i) => ({ id: `rest${i}`, done: false }))

/* The logo's dumbbell (Logo.tsx, x 192-832, y 670-870) on this bar's grid: x - 192, heights x 1.1 (200 -> 220 tall).
   Used for the launch hand-off, so the bar first shows exactly what the intro's dumbbell landed as. */
const LOGO_PLATE = {
  r: [{ x: 540, w: 56, h: 220 }, { x: 604, w: 36, h: 145.2 }],
  l: [{ x: 44, w: 56, h: 220 }, { x: 0, w: 36, h: 145.2 }],
}
/** Transform that draws plate `p` where and how big the logo's plate `to` is (origin: the plate's own centre). */
function toLogo(p: { x: number; w: number; h: number }, to: { x: number; w: number; h: number }) {
  const dx = to.x + to.w / 2 - (p.x + p.w / 2)
  return `translateX(${dx.toFixed(2)}px) scale(${(to.w / p.w).toFixed(4)}, ${(to.h / p.h).toFixed(4)})`
}

interface Plate { id: string; x: number; y: number; w: number; h: number; done: boolean; side: 'l' | 'r'; n: number }

function load(lifts: Lift[]): Plate[] {
  const sides: Record<'l' | 'r', Lift[]> = { l: [], r: [] }
  lifts.slice(0, MAX).forEach((l, i) => sides[i % 2 ? 'r' : 'l'].push(l))
  const out: Plate[] = []
  for (const side of ['l', 'r'] as const) {
    const list = sides[side], n = list.length, gap = n > 3 ? 5 : 8
    const natural = THICK.slice(0, n).reduce((t, v) => t + v, 0)
    const fit = Math.min(1, (SIDE - gap * (n - 1)) / natural)
    let edge = side === 'l' ? CELL.x - COLLAR.w : CELL.x + CELL.w + COLLAR.w
    list.forEach((l, i) => {
      const w = THICK[i] * fit, h = TALL[i]
      const x = side === 'l' ? edge - w : edge
      out.push({ id: l.id, x, y: CY - h / 2, w, h, done: l.done, side, n: i })
      edge = side === 'l' ? x - gap : x + w + gap
    })
  }
  return out
}

/** The lifts each day's bar last showed as done (seeded the first time a day is shown, so opening the app doesn't clunk). */
const seenDone = new Map<string, Set<string>>()

/** Last fuel level shown, so changing day or tab carries the liquid on from where it was. */
const lastLevel = new Map<string, number>()

/** The moving edge of the fuel, drawn every frame straight onto the SVG path and the inked digits' clip. */
function useFuel(ratio: number, start: number, delay: number) {
  const charge = useRef<SVGPathElement>(null)
  const ink = useRef<HTMLDivElement>(null)
  const s = useRef({ level: start, to: start, wob: 0 })
  useEffect(() => {
    let t = 0
    const cancel = afterIntro(() => {
      t = window.setTimeout(() => {
        const st = s.current
        if (ratio > st.to + 0.002) st.wob = Math.min(9, 4 + (ratio - st.to) * 30) // a meal went in: the surface surges
        st.to = ratio
        lastLevel.set('today', ratio)
      }, delay)
    })
    return () => { cancel(); window.clearTimeout(t) }
  }, [ratio, delay])
  useEffect(() => {
    let id = 0
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = (time: number) => {
      const st = s.current
      // A springy rise: fast at first, settling softly.
      st.level = still ? st.to : st.level + (st.to - st.level) * 0.06
      st.wob *= 0.965
      const lv = st.level
      const edge = IN.x + IN.w * lv
      const wave = (y: number) => (still ? 0 : Math.sin(y / 11 + time / 380) * 3.2 + Math.sin(y / 6.5 - time / 240) * st.wob)
      let d = '', clip = 'polygon(0 0, 0 0, 0 100%, 0 100%)'
      if (lv > 0.003) {
        if (lv > 0.997) {
          d = `M${IN.x - 4} ${IN.y - 4}H${IN.x + IN.w + 4}V${IN.y + IN.h + 4}H${IN.x - 4}Z`
          clip = 'none'
        } else {
          const pts: string[] = [], cp: string[] = []
          for (let y = CELL.y; y <= CELL.y + CELL.h; y += 6) {
            const x = edge + wave(y)
            if (y >= IN.y - 6 && y <= IN.y + IN.h + 6) pts.push(`${x.toFixed(1)} ${y}`)
            cp.push(`${(((x - CELL.x) / CELL.w) * 100).toFixed(2)}% ${(((y - CELL.y) / CELL.h) * 100).toFixed(2)}%`)
          }
          d = `M${IN.x - 4} ${IN.y - 6}L${pts.join('L')}L${IN.x - 4} ${IN.y + IN.h + 6}Z`
          clip = `polygon(0 -5%, ${cp.join(', ')}, 0 105%)`
        }
      }
      charge.current?.setAttribute('d', d)
      if (ink.current) ink.current.style.clipPath = clip
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [])
  return { charge, ink }
}

export function FuelBar({ day, eaten, target, lifts, rest }: {
  day: string
  eaten: number
  target: number
  lifts: Lift[]
  rest: boolean
}) {
  // Straight out of the launch intro the bar starts as the logo's dumbbell left it: 2 plates a side, 75% charged.
  const [fromLogo] = useState(introRunning)
  const [ready, setReady] = useState(false)
  useEffect(() => afterIntro(() => requestAnimationFrame(() => setReady(true))), [])
  // Hand-off phases: 'logo' = drawn exactly as the logo's dumbbell lands (same cell, solid plates, 2 a side), then
  // 'morph' = everything eases from there into today's bar together, then 'off' (transitions back to normal).
  const [phase, setPhase] = useState<'logo' | 'morph' | 'off'>(fromLogo ? 'logo' : 'off')
  useEffect(() => {
    if (!ready || phase !== 'logo') return
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setPhase('morph')) })
    return () => cancelAnimationFrame(id)
  }, [ready, phase])
  useEffect(() => {
    if (phase !== 'morph') return
    const t = window.setTimeout(() => setPhase('off'), 1400)
    return () => window.clearTimeout(t)
  }, [phase])

  const left = target - eaten
  const over = left < 0
  const ratio = target > 0 ? Math.min(1, Math.max(0, eaten / target)) : 0
  const shown = useCountUp(Math.abs(left), 1100, fromLogo ? 250 : 380, 'today-left')
  const { charge, ink } = useFuel(ratio, fromLogo ? 0.75 : lastLevel.get('today') ?? 0, fromLogo ? 120 : 420)
  const fuel = over ? hot(eaten / target - 1) : undefined

  const plates = load(rest ? REST : lifts)
  // Logo plates a side doesn't have today (fewer than 2 lifts there): drawn where the logo had them, then they fade out.
  const leaving = fromLogo ? (['l', 'r'] as const).flatMap((side) => [0, 1].filter((n) => !plates.some((p) => p.side === side && p.n === n)).map((n) => ({ side, n, ...LOGO_PLATE[side][n] }))) : []
  const doneCount = lifts.filter((l) => l.done).length

  // A lift finished since this day's bar was last on screen (you tick them in Train): once the bar has built, its
  // plate clunks into amber and the bar takes the hit.
  const [hit, setHit] = useState<{ ids: string[]; at: number }>({ ids: [], at: 0 })
  const doneKey = lifts.filter((l) => l.done).map((l) => l.id).join(',')
  const loaded = lifts.length > 0
  useEffect(() => {
    if (!ready || rest || !loaded) return
    const now = new Set(doneKey ? doneKey.split(',') : [])
    const before = seenDone.get(day)
    const fresh = before ? [...now].filter((id) => !before.has(id)) : []
    if (!fresh.length) { seenDone.set(day, now); return }
    // Remembered only once it has played, so a re-render in between doesn't swallow it.
    const t = window.setTimeout(() => {
      seenDone.set(day, now)
      firstHit.current = true
      setHit({ ids: fresh, at: performance.now() })
    }, firstHit.current ? 0 : 950)
    return () => window.clearTimeout(t)
  }, [doneKey, ready, rest, day, loaded])
  const firstHit = useRef(false)

  // The hit: a short, heavy jolt, like a plate slammed onto the sleeve.
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hit.at || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    bar.current?.animate([
      { transform: 'none' }, { transform: 'translateY(3px) scale(1.012, 0.985)', offset: 0.18 },
      { transform: 'translateY(-1.5px)', offset: 0.45 }, { transform: 'none' },
    ], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
  }, [hit.at])

  const num = Math.round(shown).toLocaleString('en-US')
  const cap = <><b>{over ? 'kcal over' : 'kcal left'}</b> of {Math.round(target).toLocaleString('en-US')}</>

  return (
      <div
        ref={bar}
        className={`fb${ready ? ' fb-in' : ''}${fromLogo ? ' fb-handoff' : ''}${phase === 'logo' ? ' fb-logo' : phase === 'morph' ? ' fb-morph' : ''}`}
        role="img"
        aria-label={`${Math.round(Math.abs(left)).toLocaleString('en-US')} kcal ${over ? 'over' : 'left'} of ${Math.round(target).toLocaleString('en-US')}${rest ? '' : `. ${doneCount} of ${lifts.length} lifts done`}`}
      >
        <svg className="fb-bar" viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
          <defs>
            <linearGradient id="fb-ch" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--logo-ch2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--logo-ch1)' }} />
            </linearGradient>
            <linearGradient id="fb-sh" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id="fb-clip"><rect x={IN.x} y={IN.y} width={IN.w} height={IN.h} rx={IN.h / 2} /></clipPath>
          </defs>
          <rect className="fb-collar l" x={CELL.x - COLLAR.w} y={CY - COLLAR.h / 2} width={COLLAR.w} height={COLLAR.h} rx={10} />
          <rect className="fb-collar r" x={CELL.x + CELL.w} y={CY - COLLAR.h / 2} width={COLLAR.w} height={COLLAR.h} rx={10} />
          {plates.map((p) => (
            <rect
              key={p.id + p.side}
              className={`fb-plate ${p.side}${p.done ? ' done' : ''}${p.n < 2 ? ' logo' : ''}${hit.ids.includes(p.id) ? ' clunk' : ''}`}
              x={p.x} y={p.y} width={p.w} height={p.h} rx={Math.min(14, p.w / 2.4)}
              style={{ '--d': `${(0.08 + p.n * 0.085 + (p.side === 'r' ? 0.04 : 0)).toFixed(3)}s`, '--m': fromLogo && p.n < 2 ? toLogo(p, LOGO_PLATE[p.side][p.n]) : undefined } as CSSProperties}
            />
          ))}
          {leaving.map((p) => (
            <rect key={`leave${p.side}${p.n}`} className={`fb-plate logo leave ${p.side}`} x={p.x} y={CY - p.h / 2} width={p.w} height={p.h} rx={Math.min(14, p.w / 2.4)} />
          ))}
          <g className="fb-core">
            <rect className="fb-cell" x={CELL.x} y={CELL.y} width={CELL.w} height={CELL.h} rx={CELL.h / 2} />
            <g clipPath="url(#fb-clip)">
              <path ref={charge} className="fb-charge" style={fuel ? { fill: fuel } : undefined} />
              <rect className="fb-sheen" x={IN.x - 120} y={IN.y} width={120} height={IN.h} fill="url(#fb-sh)" />
            </g>
          </g>
        </svg>
        {/* The numbers sit over the cell twice: plain, and inked where the fuel has reached. */}
        <div className="fb-read" aria-hidden="true">
          <div className="fb-txt"><span className="fb-num">{num}</span><span className="fb-cap">{cap}</span></div>
          <div className="fb-txt fb-ink" ref={ink}><span className="fb-num">{num}</span><span className="fb-cap">{cap}</span></div>
        </div>
      </div>
  )
}
