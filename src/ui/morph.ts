import { R_PATH } from './mark'

/* The end of the launch intro: the little dumbbell in the logo turns into Today's real barbell.

   It moves as one object. The little dumbbell lifts off the tile and rises into place while it grows: its centre pill
   stretches into the grip, a rod draws out to both ends, and the plates slide outward along it into their spots
   (the inner plates become the collars, the big plate splits into the two big plates, the outer plate becomes the
   medium one). The R drops onto the grip with a small bounce. The empty tile is left behind and dissolves.

   It is shot like a film: the page starts close up on the bar and the camera pulls back as it flies in; the flying
   pieces stretch with their speed; when the bar touches down it dips under the weight and the plates squash, while
   its shadow on the page darkens as it comes down; then the numbers and the rest of the page settle in around it.

   It works on live screen positions: every piece is measured where it sits in the logo and where its twin sits in the
   real (still hidden) bar, and flown between the two as a plain element, so it lands pixel-exact and the real bar takes
   over without a seam. Colours are read from the page too, so it follows light/dark. */

type Box = { x: number; y: number; w: number; h: number; r: number } // centre, size, corner radius (px)
type RGBA = [number, number, number, number]

interface Piece {
  el: HTMLElement
  base: Box // the element's real size; every frame only scales it (so the morph never triggers layout or repaint)
  over?: HTMLElement // second layer that fades in (the target colour, or the grip's tile gradient)
  from: Box
  to: Box
  c0?: RGBA
  c1?: RGBA
  delay: number
  dur: number
  fadeIn?: boolean // starts invisible (the rod)
  fadeOut?: boolean // leaves before landing (the charge)
  pop?: boolean // appears at its spot (the rod ends)
  drop?: boolean // falls onto the bar (the R)
  body?: boolean // a solid piece that stretches with speed and squashes on landing (plates, R)
  last?: { x: number; y: number; vx: number; vy: number } // previous centre and smoothed speed (px/ms)
}

const IDLE = 1700 // after touch-down: everything has settled (cascade, counters, bend), so heavy cleanup can't be seen

const SQUEEZE = 170 // anticipation: the tile gathers itself before the parts lift off
const RIG = 1000 // the whole dumbbell rising into place
const LIFT = 14 // how far it lifts above its spot on the way, before settling down onto it (px)
const TOUCH = 870 // when the dumbbell touches down in its spot (ms into the flight)
const ZOOM = 1.16 // the page starts this close on the bar; the camera pulls back while it flies in
const MORPH_MS = 1320 // whole morph, from the squeeze to the last piece landing; the bar bends a beat after (Barbell.tsx)
/** Touch-down: a quick dip under the weight and one small rebound, gone in under 0.3 s (about 1 at the bottom). */
const impact = (ms: number) => (ms <= 0 ? 0 : 1.7 * Math.exp(-ms / 85) * Math.sin((Math.PI * ms) / 120))

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3)
const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
/** Slides out and settles with one small overshoot, like a plate sliding along a bar and stopping. */
const settle = (p: number) => (p >= 1 ? 1 : 1 - Math.exp(-5 * p) * Math.cos(5.2 * p))
/** Rises smoothly and arrives softly. */
const rise = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(1 - p, 3.2))
/** The R: a small lift, then it falls (speeding up, like gravity) onto the grip and bounces once. */
const drop = (p: number) => {
  if (p < 0.3) return -0.18 * Math.sin((Math.PI * p) / 0.3) * 0.5
  const u = (p - 0.3) / 0.7
  return u < 0.78 ? Math.pow(u / 0.78, 2) : 1 - 0.07 * Math.sin((Math.PI * (u - 0.78)) / 0.22)
}

function colour(c: string): RGBA {
  if (!c || c === 'none' || c === 'transparent') return [0, 0, 0, 0]
  const n = (c.match(/[\d.]+/g) ?? []).map(Number)
  const k = c.startsWith('color(') ? 255 : 1
  return [(n[0] ?? 0) * k, (n[1] ?? 0) * k, (n[2] ?? 0) * k, n[3] ?? 1]
}
const mix = (a: RGBA, b: RGBA, t: number) => `rgba(${a.slice(0, 3).map((v, i) => Math.round(lerp(v, b[i], t))).join(',')},${lerp(a[3], b[3], t).toFixed(3)})`

function measure(el: Element, r = 0): Box {
  const b = el.getBoundingClientRect()
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, r }
}

/** Runs the morph from the logo in `tile` to the barbell drawn in `bar`, in `layer` (a full-screen box above the page).
 *  Calls onLand the moment every piece is in place (show the real bar then), and onDone a frame later. */
export function morphLogoToBar({ tile, bar, layer, onLand, onDone }: {
  tile: HTMLElement; bar: SVGSVGElement; layer: HTMLElement; onLand: () => void; onDone: () => void
}): () => void {
  let raf = 0
  const timers: number[] = []
  let cleanup = () => {}

  // 1. Anticipation: a quick gather before everything lifts off.
  tile.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.93)' }], { duration: SQUEEZE, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' })

  timers.push(window.setTimeout(() => {
    const logo = tile.querySelector('svg')
    if (!logo) { onLand(); onDone(); return }
    const lu = logo.getBoundingClientRect().width / 1024 // px per logo unit
    const bu = bar.getBoundingClientRect().width / 360 // px per bar unit
    const q = (sel: string) => [...bar.querySelectorAll(sel)]
    const fill = (el: Element) => colour(getComputedStyle(el).fill)

    const pieces: Piece[] = []
    // Stacked like the real bar: rod at the back, then the grip, the R on top of it; plates over the rod.
    const add = (p: Omit<Piece, 'el' | 'base'>, cls = '', z = 3) => {
      const el = document.createElement('div')
      el.className = `mo ${cls}`
      // Sized once, at whichever end is bigger, so scaling only ever shrinks it (stays sharp); at the end it is exact.
      const base = p.from.w * p.from.h > p.to.w * p.to.h ? p.from : p.to
      Object.assign(el.style, { zIndex: String(z), width: `${base.w}px`, height: `${base.h}px`, borderRadius: `${base.r}px` })
      if (p.c0) el.style.backgroundColor = mix(p.c0, p.c0, 0)
      const piece: Piece = { ...p, el, base }
      if (p.c0 && p.c1 && p.c0.some((v, i) => Math.abs(v - p.c1![i]) > 0.5)) {
        piece.over = document.createElement('div')
        piece.over.className = 'mo-to'
        piece.over.style.backgroundColor = mix(p.c1, p.c1, 0)
        el.appendChild(piece.over)
      }
      layer.appendChild(el)
      pieces.push(piece)
      return piece
    }

    // Logo parts, and their twins in the real bar. Bar plates come in pairs from the collar outwards: big, big, medium.
    const lp = (i: number, s: string) => logo.querySelector(`.lg-p${i}.${s}`)!
    const cell = logo.querySelector('.lg-cell')!
    const plates = q('.bb-plate')
    const [cl, cr] = q('.bb-collar')
    const [endL, endR] = q('.bb-end')
    const grip = bar.querySelector('.bb-grip')!
    const rod = bar.querySelector('.bb-rod')!

    // The whole dumbbell travels from the logo's pill to the grip; every piece is placed relative to that.
    const cellBox = measure(cell, 56 * lu)
    const gripBox = measure(grip, 8 * bu)

    // Centre: the pill becomes the grip (its tile gradient fades in), the charge rides along and fades, the R drops on.
    const g = add({ from: cellBox, to: gripBox, c0: fill(cell), delay: 0, dur: RIG }, 'mo-grip', 2)
    g.el.style.setProperty('--edge0', getComputedStyle(cell).stroke)
    g.over = document.createElement('div')
    g.over.className = 'mo-tile mo-to'
    g.el.appendChild(g.over)
    add({ from: measure(logo.querySelector('.lg-charge')!, 40 * lu), to: { ...gripBox, w: gripBox.w * 0.62, h: gripBox.h * 0.42, r: gripBox.h * 0.21 }, delay: 0, dur: RIG, fadeOut: true }, 'mo-charge', 2)
    const rEl = add({ from: measure(logo.querySelector('.lg-r')!), to: measure(bar.querySelector('.bb-r path')!), delay: 60, dur: 1050, drop: true, body: true }, 'mo-r', 4).el
    rEl.innerHTML = `<svg viewBox="352 180 328 420" preserveAspectRatio="none" width="100%" height="100%"><path d="${R_PATH}" fill-rule="evenodd" /></svg>`

    // The rod draws out from the pill to both ends.
    const rodB = measure(rod)
    const rodWidth = (t: number) => lerp(cellBox.w * 0.8, rodB.w + 9 * bu, settle(clamp(t / RIG)))
    const steel = colour(getComputedStyle(rod).stroke)
    add({ from: { ...cellBox, w: cellBox.w * 0.8, h: cellBox.h * 0.3, r: cellBox.h * 0.15 }, to: { ...rodB, w: rodB.w + 9 * bu, h: 9 * bu, r: 4.5 * bu }, c0: steel, delay: 0, dur: RIG, fadeIn: true }, '', 1)

    // Plates slide out along it: inner → collar, big → both big plates (they split apart), outer → medium.
    const plate = (src: Element, dst: Element, delay: number, rx: number, dstRx: number) =>
      add({ from: measure(src, rx * lu), to: measure(dst, dstRx * bu), c0: fill(src), c1: fill(dst), delay, dur: RIG, body: true })
    plate(lp(1, 'l'), cl, 40, 8, 3); plate(lp(1, 'r'), cr, 40, 8, 3)
    plate(lp(2, 'l'), plates[0], 60, 16, 3.5); plate(lp(2, 'r'), plates[1], 60, 16, 3.5)
    plate(lp(2, 'l'), plates[2], 100, 16, 3.5); plate(lp(2, 'r'), plates[3], 100, 16, 3.5)
    plate(lp(3, 'l'), plates[4], 140, 14, 3.5); plate(lp(3, 'r'), plates[5], 140, 14, 3.5)
    // The rod's ends click on as everything arrives.
    for (const e of [endL, endR]) {
      const to = measure(e, 2.5 * bu)
      add({ from: to, to, c0: fill(e), delay: 830, dur: 320, pop: true }, '', 1)
    }

    // The logo's own parts hand over to the flying pieces; the empty tile dissolves.
    for (const part of logo.querySelectorAll('.lg-r, .lg-plates, .lg-cell, .lg-charge')) (part as SVGElement).style.opacity = '0'
    tile.animate([{ opacity: 1, transform: 'scale(0.93)' }, { opacity: 0, transform: 'scale(1.14)' }], { duration: 420, easing: 'ease-out', fill: 'forwards' })

    // The bar's shadow on the page, under where it will rest.
    const shadow = document.createElement('div')
    shadow.className = 'mo mo-shadow'
    layer.appendChild(shadow)
    const ground = Math.max(...plates.map((pl) => pl.getBoundingClientRect().bottom)) + 4 * bu
    const SW = rodB.w, SH = 24 // shadow's real size; scaled per frame
    Object.assign(shadow.style, { width: `${SW}px`, height: `${SH}px` })

    // What settles in after touch-down, read now so the landing frame does no layout work.
    const blocks = [...document.querySelectorAll<HTMLElement>('.td-budget > .td-big, .td-budget > .td-cap, .td-budget > .td-macros, .td .wt, .td .td-week, .td .td-loghead, .td .td-group')]
      .filter((el) => el.getBoundingClientRect().top < window.innerHeight)
    const tabs = document.querySelector<HTMLElement>('.app > .tabs')
    const barBox = bar.closest<HTMLElement>('.bb')

    // Camera: the page (measured above at its real size) starts close on the bar and pulls back to normal by touch-down.
    const end = MORPH_MS - SQUEEZE
    const shots = [...document.querySelectorAll<HTMLElement>('.app > .appbar, .app > main')].map((el) => {
      const b = el.getBoundingClientRect()
      el.style.transformOrigin = `${gripBox.x - b.left}px ${gripBox.y - b.top}px`
      const a = el.animate([{ transform: `scale(${ZOOM})` }, { transform: 'scale(1)' }], { duration: end, easing: 'cubic-bezier(0.22, 0.75, 0.2, 1)', fill: 'forwards' })
      return { el, a }
    })

    // 2. Flight.
    const t0 = performance.now()
    let prev = t0
    const frame = (now: number) => {
      const t = now - t0
      const dt = Math.max(1, now - prev)
      prev = now
      const done = t >= end
      // Where the dumbbell's centre is: rising into place, lifting a little above it on the way, dipping on touch-down.
      const ka = clamp(t / RIG)
      const hit = done ? 0 : impact(t - TOUCH)
      const ax = lerp(cellBox.x, gripBox.x, rise(ka))
      const ay = lerp(cellBox.y, gripBox.y, rise(ka)) - LIFT * Math.sin(Math.PI * Math.min(1, ka * 1.15)) + 5 * hit
      // Shadow: faint and wide while the bar is high, darker and tighter as it comes down, gone once it has settled.
      const height = Math.max(0, ground - (ay + (ground - gripBox.y)))
      const span = rodWidth(t)
      const sw = span * (0.9 + height / 120), sh = 14 + height / 6
      shadow.style.transform = `translate(${(ax - SW / 2).toFixed(1)}px, ${(ground - SH / 2 - height / 12).toFixed(1)}px) scale(${(sw / SW).toFixed(4)}, ${(sh / SH).toFixed(4)})`
      shadow.style.opacity = String((0.34 * rise(ka) / (1 + height / 40)) * (t > TOUCH ? Math.exp(-(t - TOUCH) / 110) : 1))
      for (const p of pieces) {
        const k = clamp((t - p.delay) / p.dur)
        // Offset from the dumbbell's centre: plates slide outwards and settle; the R falls onto the grip.
        const ox = lerp(p.from.x - cellBox.x, p.to.x - gripBox.x, settle(k))
        const oy = lerp(p.from.y - cellBox.y, p.to.y - gripBox.y, p.drop ? drop(k) : outCubic(k))
        const grow = p.pop ? settle(k) : outCubic(k)
        const w = p.pop ? p.to.w * grow : Math.max(0, lerp(p.from.w, p.to.w, p.fadeIn ? settle(k) : grow))
        const h = p.pop ? p.to.h * grow : Math.max(0, lerp(p.from.h, p.to.h, grow))
        const cx = p.pop ? p.to.x : ax + ox
        const cy = p.pop ? p.to.y : ay + oy
        // Solid pieces stretch along their motion (more speed, more stretch) and squash flat on touch-down.
        let sx = 1, sy = 1
        if (p.body && !done) {
          const l = p.last ?? { x: cx, y: cy, vx: 0, vy: 0 }
          const vx = l.vx * 0.6 + ((cx - l.x) / dt) * 0.4
          const vy = l.vy * 0.6 + ((cy - l.y) / dt) * 0.4
          p.last = { x: cx, y: cy, vx, vy }
          const v = Math.hypot(vx, vy)
          const st = Math.min(0.22, v * 0.28)
          const fx = v ? Math.abs(vx) / v : 0, fy = v ? Math.abs(vy) / v : 0
          sx = (1 + st * fx - st * 0.45 * fy) * (1 + 0.05 * hit)
          sy = (1 + st * fy - st * 0.45 * fx) * (1 - 0.08 * hit)
        }
        const s = p.el.style
        s.transform = `translate(${(cx - p.base.w / 2).toFixed(2)}px, ${(cy - p.base.h / 2).toFixed(2)}px) scale(${((w / p.base.w) * sx).toFixed(4)}, ${((h / p.base.h) * sy).toFixed(4)})`
        if (p.over) p.over.style.opacity = String(p.over.classList.contains('mo-tile') ? clamp((k - 0.25) / 0.5) : inOut(k))
        s.opacity = p.fadeIn ? String(clamp(k / 0.2)) : p.fadeOut ? String(1 - clamp((k - 0.45) / 0.4)) : p.pop ? String(k > 0 ? 1 : 0) : '1'
      }
      // Just before landing, the real bar is drawn under the pieces (they cover it), so it's painted before it's needed.
      if (barBox && t >= end - 60) barBox.style.opacity = '1'
      if (!done) { raf = requestAnimationFrame(frame); return }
      // 3. Landing, spread over a few frames so no single frame does much:
      //    now: the pieces give way to the real bar, the page starts settling, the tab bar rises in;
      //    next frame: counters and the bend start (onLand); idle: camera and intro are cleared away once nothing moves.
      layer.style.visibility = 'hidden'
      ;(layer.parentElement as HTMLElement).style.pointerEvents = 'none'
      settlePage(blocks, tabs)
      raf = requestAnimationFrame(() => {
        onLand()
        timers.push(window.setTimeout(cleanup, IDLE))
      })
    }
    cleanup = () => {
      for (const { el, a } of shots) { a.cancel(); el.style.transformOrigin = '' }
      if (barBox) barBox.style.opacity = ''
      layer.replaceChildren()
      cleanup = () => {}
      onDone()
    }
    raf = requestAnimationFrame(frame)
  }, SQUEEZE))

  return () => { cancelAnimationFrame(raf); timers.forEach((t) => window.clearTimeout(t)); cleanup() }
}

/** After touch-down, what's under the bar (held faint and low during the morph, see index.css) rises into place, one
 *  block after another: the calories, the macros, the water, the week, the log; the tab bar rises in from below.
 *  Opacity and transform only, so it runs on the graphics chip. */
function settlePage(blocks: HTMLElement[], tabs: HTMLElement | null) {
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  blocks.forEach((el, i) => el.animate([{ opacity: 0.16, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 60 + i * 70, easing: ease, fill: 'backwards' }))
  tabs?.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 120, easing: ease, fill: 'backwards' })
}
