import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Intro } from './Intro'

/* Launch intro gate. While the intro plays, the page underneath is already rendered (so the logo knows where to morph)
   but its entrance motion is held: CSS animations pause via html[data-intro='build'] until the morph starts ('fly'),
   and number count-ups / bar fills / the bar's bend (ui/motion.ts, Barbell) wait in this queue until the bar lands,
   so the page settles in around it. */
let queue: (() => void)[] | null = null

/** Runs `f` now, or when the intro releases the page. Returns a cancel function. */
export function afterIntro(f: () => void): () => void {
  if (!queue) { f(); return () => {} }
  queue.push(f)
  return () => { if (queue) queue = queue.filter((x) => x !== f) }
}

function flush() {
  const q = queue ?? []
  queue = null
  q.forEach((f) => f())
}

/** Cold start only: main.tsx runs once per launch, so this plays after the app was fully closed,
 *  not when it comes back from the background. Off when the phone has Reduce Motion on. */
export function mountIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  queue = []
  document.documentElement.dataset.intro = 'build'
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    if (queue) flush()
    delete document.documentElement.dataset.intro
    root.unmount()
    host.remove()
  }
  // Landing: the page's own barbell appears under the morphed pieces (hidden while html[data-intro] is set), already
  // built: html[data-landed] turns off its own entrance animations for the rest of the session.
  const fly = () => { document.documentElement.dataset.intro = 'fly' }
  // Landing: counters, fills and the bend start; the page's own intro styles come off a frame later (the morph's settle
  // animations already hold the same look), so no single frame carries all of it.
  const land = () => {
    document.documentElement.dataset.landed = ''
    if (queue) flush()
    requestAnimationFrame(() => { delete document.documentElement.dataset.intro })
  }
  root.render(createElement(Intro, { onRelease: fly, onLand: land, onDone: finish }))
}
